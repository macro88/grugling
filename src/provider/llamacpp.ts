// OpenAI-compatible HTTP adapter for the Provider port, targeting llama.cpp.
//
// Constrains output via a top-level GBNF `grammar` — the only working path on
// the target build (ADR-0002). Seeded by the router spike's provider.ts.
//
// Fallback ladder (ADR-0002): constrain → parse-and-repair → treat-as-answer.
// Slice 1 implements the first two: the grammar constrains, and tryParse() does
// a lenient repair. A non-conformant result is reported (ok && !conformant),
// never silently turned into a chat reply.

import type { Logger } from "../logging/logger.ts";
import type { DecideArgs, DecideResult, Provider } from "./provider.ts";

export interface LlamaCppOptions {
  baseUrl: string;
  model: string;
  logger?: Logger;
  // Injectable for tests; defaults to the global fetch.
  fetchImpl?: typeof fetch;
  defaultMaxTokens?: number;
  defaultTimeoutMs?: number;
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export function createLlamaCppProvider(opts: LlamaCppOptions): Provider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;

  async function decide<T>(args: DecideArgs): Promise<DecideResult<T>> {
    const messages: ChatMessage[] = [];
    if (args.system) messages.push({ role: "system", content: args.system });
    messages.push({ role: "user", content: args.user });

    const body = {
      model: opts.model,
      messages,
      temperature: 0,
      max_tokens: args.maxTokens ?? opts.defaultMaxTokens ?? 64,
      stream: false,
      grammar: args.grammar, // top-level GBNF — ADR-0002
    };

    const timeoutMs = args.timeoutMs ?? opts.defaultTimeoutMs ?? 60_000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const start = performance.now();

    let result: DecideResult<T>;
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const ms = performance.now() - start;
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        result = { ok: false, conformant: false, value: null, raw: text.slice(0, 300), ms, error: `HTTP ${res.status}` };
      } else {
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const raw = json.choices?.[0]?.message?.content ?? "";
        const parsed = tryParse(raw);
        const conformant = parsed !== null && typeof parsed === "object";
        result = { ok: true, conformant, value: conformant ? (parsed as T) : null, raw, ms };
      }
    } catch (e) {
      const ms = performance.now() - start;
      const err = e as Error & { cause?: unknown };
      const cause = err.cause instanceof Error ? `: ${err.cause.message}` : "";
      const error = err.name === "AbortError" ? `timed out after ${timeoutMs}ms` : `${err.message}${cause}`;
      result = { ok: false, conformant: false, value: null, raw: "", ms, error };
    } finally {
      clearTimeout(timer);
    }

    opts.logger?.log({
      event: "model_call",
      callSite: args.callSite ?? "decide",
      model: opts.model,
      ms: Math.round(result.ms),
      ok: result.ok,
      conformant: result.conformant,
      grammarBytes: args.grammar.length,
      ...(result.error ? { error: result.error } : {}),
    });

    return result;
  }

  return { decide };
}

// Lenient parse: a constrained response should be clean JSON, but a repair
// fallback can wrap it — pull the first {...} out before giving up.
function tryParse(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}
