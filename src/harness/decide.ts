// Decide: the call-site inside the decision loop that chooses the next tool (or
// to finish), constrained by a grammar built from the in-scope tools' input
// schemas (CONTEXT.md › Decide, ADR-0002). It produces *facts*, never
// user-facing prose — Voice handles the reply (ADR-0003).
//
// Like every constrained call-site (cf. route.ts) the prompt is freshly
// assembled from fixed slots — the Decide instruction, the in-scope tool list,
// and the facts gathered so far — never a growing transcript (ADR-0006).

import { compileDecideGrammar, FINISH, matchesDecideSchema } from "../provider/gbnf.ts";
import type { DecideResult, Provider } from "../provider/provider.ts";
import type { Tool, Trust } from "../tools/tool.ts";
import { assembleSystem } from "./prompt.ts";

// One step's outcome, distilled for context: the compact `summary` (compressed
// tool output) is what re-enters the model; the full raw output lives
// out-of-context behind `rawPointer` (ADR-0005, PRD › user stories 7–8).
export interface Fact {
  tool: string;
  args: Record<string, string>;
  ok: boolean;
  summary: string;
  trust: Trust;
  rawPointer: string;
}

// A tool call (name + args) or the reserved finish. "finish" can never be a tool
// name (the registry/compiler reject it), so the discriminant is unambiguous.
export interface ToolCall {
  tool: string;
  args: Record<string, string>;
}
export interface Finish {
  tool: typeof FINISH;
}
export type DecideValue = ToolCall | Finish;

export function isFinish(value: DecideValue): value is Finish {
  return value.tool === FINISH;
}

// Per-call-site fragment only — no global system prompt (ADR-0006). The grammar
// already guarantees a well-formed choice, so this only steers *which* one.
export const DECIDE_INSTRUCTION =
  "Pick one tool to gather what you need to answer the user, or finish when you " +
  "have enough. Choose the tool and its arguments.";

function renderTools(tools: Tool[]): string {
  return ["tools:", ...tools.map((t) => `- ${t.name}: ${t.description}`)].join("\n");
}

// The facts so far, as plain data — empty drops out of the assembled prompt.
export function renderFacts(facts: Fact[]): string | undefined {
  if (facts.length === 0) return undefined;
  return ["facts so far:", ...facts.map((f) => `- ${f.tool}: ${f.summary}`)].join("\n");
}

export function decide(
  provider: Provider,
  args: { tools: Tool[]; facts: Fact[]; message: string; maxTokens?: number },
): Promise<DecideResult<DecideValue>> {
  return provider.decide<DecideValue>({
    system: assembleSystem(DECIDE_INSTRUCTION, renderTools(args.tools), renderFacts(args.facts)),
    user: args.message,
    grammar: compileDecideGrammar(args.tools),
    callSite: "decide",
    conformsTo: (v) => matchesDecideSchema(args.tools, v),
    maxTokens: args.maxTokens,
  });
}
