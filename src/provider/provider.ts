// The Provider port: how the harness reaches a model. Defined by what the
// harness needs — "return a decision matching this grammar" — never by how its
// first adapter happens to work (ADR-0001). baseUrl/model are bound when an
// adapter is constructed; a call only carries the per-decision inputs.

export interface DecideArgs {
  // The message the model decides about.
  user: string;
  // GBNF grammar the output must satisfy (built by the schema→GBNF compiler).
  grammar: string;
  // Optional per-call-site fragment — there is no global system prompt (ADR-0006).
  system?: string;
  // Names the call-site in the structured log (route | decide | voice | ...).
  callSite?: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface DecideResult<T = unknown> {
  ok: boolean; // transport succeeded: HTTP 2xx + parseable JSON object
  conformant: boolean; // got structured output the grammar shaped
  value: T | null; // the parsed decision object, when conformant
  raw: string; // raw assistant content (or an error excerpt)
  ms: number; // wall-clock for the call
  error?: string; // set when !ok
}

export interface Provider {
  decide<T = unknown>(args: DecideArgs): Promise<DecideResult<T>>;
}
