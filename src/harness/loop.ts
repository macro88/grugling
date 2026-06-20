// The bounded Decision loop (ADR-0003). Stateless and capped: each iteration is
// one constrained Decide (pick a tool or finish) followed by one deterministic
// tool execution, whose raw output is compressed before it re-enters context
// (PRD › user stories 4, 6, 7). The loop produces *facts*; the pipeline hands
// them to Voice for the reply.
//
// Two safety properties live here: the iteration **cap** (a confused model can't
// loop forever or burn the machine) and the **fallback ladder's** last rung — a
// non-conformant decision is logged as a failure and surfaced, never silently
// turned into a chat reply (ADR-0002).

import type { Logger } from "../logging/logger.ts";
import type { Provider } from "../provider/provider.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import type { Compressor } from "./compress.ts";
import { decide, type Fact, isFinish } from "./decide.ts";

// Full raw tool output, preserved outside the model context (PRD › user story 8)
// and keyed by the pointer carried on the corresponding Fact.
export interface RawRecord {
  pointer: string;
  tool: string;
  raw: string;
}

export type LoopOutcome =
  | { kind: "facts"; facts: Fact[]; raws: RawRecord[]; decideCalls: number }
  | { kind: "fallback"; facts: Fact[]; raws: RawRecord[]; decideCalls: number; raw: string }
  // The trust boundary fired: an untrusted tool result can't yet be used safely.
  | { kind: "blocked"; tool: string; facts: Fact[]; raws: RawRecord[]; decideCalls: number }
  | { kind: "error"; error: string };

export interface LoopOptions {
  registry: ToolRegistry;
  message: string;
  cap: number;
  compressor: Compressor;
  decisionMaxTokens?: number;
  logger?: Logger;
}

export async function runDecisionLoop(provider: Provider, opts: LoopOptions): Promise<LoopOutcome> {
  const tools = opts.registry.list();
  const facts: Fact[] = [];
  const raws: RawRecord[] = [];
  let decideCalls = 0;

  while (decideCalls < opts.cap) {
    const d = await decide(provider, { tools, facts, message: opts.message, maxTokens: opts.decisionMaxTokens });
    decideCalls++;

    if (!d.ok) return { kind: "error", error: d.error ?? "model unreachable" };
    if (!d.conformant || d.value === null) {
      // Fallback ladder rung 3: treat-as-answer, logged as a failure — visible,
      // never a silent chat reply (ADR-0002).
      opts.logger?.warn({ event: "fallback", callSite: "decide", reason: "non-conformant decision", raw: d.raw, decideCall: decideCalls });
      return { kind: "fallback", facts, raws, decideCalls, raw: d.raw };
    }

    const value = d.value;
    if (isFinish(value)) break;

    // The grammar + conformance check guarantee an in-scope tool name.
    const tool = opts.registry.get(value.tool)!;
    const envelope = await tool.execute(value.args);

    // Trust boundary (ADR-0005): raw untrusted output must be distilled by a
    // tool-less call-site before any deciding step can act on it. That
    // distillation step lands with the summarise-link skill (build-order step
    // 4); until it exists the loop fails closed rather than feed untrusted
    // content to a tool-bearing Decide call.
    if (envelope.trust === "untrusted") {
      opts.logger?.error({ event: "trust_boundary", tool: value.tool, action: "blocked" });
      return { kind: "blocked", tool: value.tool, facts, raws, decideCalls };
    }

    const summary = opts.compressor.compress(envelope.raw);
    const rawPointer = String(raws.length);
    raws.push({ pointer: rawPointer, tool: value.tool, raw: envelope.raw });
    facts.push({ tool: value.tool, args: value.args, ok: envelope.ok, summary, trust: envelope.trust, rawPointer });

    opts.logger?.info({
      event: "tool_call",
      tool: value.tool,
      ok: envelope.ok,
      trust: envelope.trust,
      rawBytes: envelope.raw.length,
      summaryBytes: summary.length,
    });
  }

  return { kind: "facts", facts, raws, decideCalls };
}
