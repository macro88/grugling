// The Tool contract (ADR-0001). A Tool is a single deterministic capability the
// harness can invoke. Every tool exposes the same shape, so adding one never
// touches the harness — the registry collects them and their `inputSchema`s
// generate the Decide grammar (ADR-0002).
//
// `trust` gates the trust boundary (ADR-0005): a tool declares whether its
// output is safe to feed to a deciding call-site. `risk` and the forward-compat
// `needsConfirmation` / `longRunning` flags are declared but not acted on in the
// MVP (confirmation policy is off — ADR-0007).

import type { EnumDecisionSchema } from "../provider/gbnf.ts";

export type Trust = "trusted" | "untrusted";
export type Risk = "low" | "medium" | "high";

// The uniform result a tool returns. Per ADR-0001 compression is a swappable
// port applied by the Decide loop, not by each tool — so the envelope carries
// the *full* raw output (preserved outside model context) plus ok/trust, and the
// loop derives the compact, in-context fact (the PRD's "short summary") from it.
export interface ResultEnvelope {
  ok: boolean; // tool succeeded / exited cleanly
  raw: string; // full output — preserved out-of-context, never sent to the model verbatim
  trust: Trust; // gates the trust boundary off the *result* (ADR-0005)
}

export interface ToolMeta {
  trust: Trust;
  risk: Risk;
  needsConfirmation?: boolean; // declared, not implemented in MVP
  longRunning?: boolean; // declared, not implemented in MVP
}

export interface Tool {
  name: string;
  description: string; // one line — shown to the model at the Decide call-site
  inputSchema: EnumDecisionSchema; // → fed to the schema→GBNF compiler (ADR-0002)
  meta: ToolMeta;
  execute(args: Record<string, string>): ResultEnvelope | Promise<ResultEnvelope>;
}
