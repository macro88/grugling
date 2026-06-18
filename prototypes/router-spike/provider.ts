// PORTABLE MODULE — the bit of this spike worth keeping.
//
// A minimal Provider call that forces a local OpenAI-compatible model to emit
// output matching a JSON schema. This is the seed of build-order step 1
// (Provider adapter + constrained decoding, ADR-0002). It contains NO eval or
// terminal code — the throwaway shell (spike.ts) imports it; nothing flows back.
//
// ADR-0002 rejects native function-calling and bets reliability on the runtime's
// constraint features. llama.cpp / LM Studio expose these differently through the
// generic /v1/chat/completions transport, so we probe which one actually works on
// THIS runtime rather than assuming.

export type ConstraintMethod =
  | "openai_json_schema" // response_format.json_schema  (OpenAI-style, recent llama.cpp + LM Studio)
  | "llamacpp_json_schema" // top-level `json_schema`     (llama.cpp server extension)
  | "grammar" // top-level `grammar` (GBNF)               (llama.cpp native)
  | "json_object"; // response_format.json_object          (JSON mode, no schema — weakest)

export const ALL_METHODS: ConstraintMethod[] = [
  "openai_json_schema",
  "llamacpp_json_schema",
  "grammar",
  "json_object",
];

export interface DecideArgs {
  baseUrl: string; // e.g. http://127.0.0.1:8080/v1
  model: string;
  system?: string;
  user: string;
  enum: string[]; // the only legal values of the `tool` field
  method: ConstraintMethod;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface DecideResult {
  ok: boolean; // HTTP 2xx + parseable JSON object
  conformant: boolean; // parsed.tool is one of the supplied enum values
  tool: string | null; // the chosen tool, if conformant
  raw: string; // raw assistant content
  ms: number; // wall-clock for the HTTP call
  method: ConstraintMethod;
  error?: string;
}

// JSON schema for a single enum decision: { "tool": <one of enum> }.
function decisionSchema(values: string[]) {
  return {
    type: "object",
    properties: { tool: { type: "string", enum: values } },
    required: ["tool"],
    additionalProperties: false,
  };
}

// GBNF for the same decision. Building this by hand (rather than relying on the
// server's schema→grammar converter) is what genuinely exercises the GBNF path
// ADR-0002 names. Only valid for this fixed { tool: enum } shape.
function decisionGrammar(values: string[]): string {
  const alts = values.map((v) => `"\\"${v}\\""`).join(" | ");
  return [
    `root ::= "{" ws "\\"tool\\"" ws ":" ws val ws "}"`,
    `val ::= ${alts}`,
    `ws ::= " "?`,
  ].join("\n");
}

function bodyFor(args: DecideArgs): Record<string, unknown> {
  const messages: Array<{ role: string; content: string }> = [];
  if (args.system) messages.push({ role: "system", content: args.system });
  messages.push({ role: "user", content: args.user });

  const body: Record<string, unknown> = {
    model: args.model,
    messages,
    temperature: 0,
    max_tokens: args.maxTokens ?? 16,
    stream: false,
  };

  const schema = decisionSchema(args.enum);
  switch (args.method) {
    case "openai_json_schema":
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "decision", strict: true, schema },
      };
      break;
    case "llamacpp_json_schema":
      body.json_schema = schema;
      break;
    case "grammar":
      body.grammar = decisionGrammar(args.enum);
      break;
    case "json_object":
      body.response_format = { type: "json_object" };
      break;
  }
  return body;
}

export async function decide(args: DecideArgs): Promise<DecideResult> {
  const url = `${args.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 60_000);
  const start = performance.now();
  let raw = "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bodyFor(args)),
      signal: ctrl.signal,
    });
    const ms = performance.now() - start;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return mk(false, false, null, text.slice(0, 300), ms, args.method, `HTTP ${res.status}`);
    }
    const json = (await res.json()) as any;
    raw = json?.choices?.[0]?.message?.content ?? "";
    const parsed = tryParse(raw);
    const tool = typeof parsed?.tool === "string" ? parsed.tool : null;
    const conformant = tool !== null && args.enum.includes(tool);
    return mk(true, conformant, conformant ? tool : null, raw, ms, args.method);
  } catch (e) {
    const ms = performance.now() - start;
    return mk(false, false, null, raw, ms, args.method, (e as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

// Lenient parse: constrained methods should return clean JSON, but JSON-mode and
// repair fallbacks can wrap it — pull the first {...} out before giving up.
function tryParse(raw: string): any | null {
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

function mk(
  ok: boolean,
  conformant: boolean,
  tool: string | null,
  raw: string,
  ms: number,
  method: ConstraintMethod,
  error?: string,
): DecideResult {
  return { ok, conformant, tool, raw, ms, method, error };
}
