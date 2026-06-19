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
  // Verifies the parsed output actually conforms (e.g. enum membership) — the
  // grammar's source schema, applied as a predicate so the port stays
  // schema-agnostic. Output that parses but fails this is reported as
  // non-conformant, never accepted silently (ADR-0002). Defaults to "any object".
  conformsTo?: (value: unknown) => boolean;
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

// Free-text generation: the Voice call-site (ADR-0003). Unlike a decision it is
// *unconstrained* — no grammar, no schema — because Voice is the one place the
// model writes prose for a human. Persona is supplied as a per-call-site
// `system` fragment (ADR-0006); there is no global system prompt.
export interface GenerateArgs {
  user: string;
  system?: string;
  callSite?: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface GenerateResult {
  ok: boolean; // transport succeeded: HTTP 2xx + parseable response
  text: string; // the model's reply (empty when !ok)
  ms: number; // wall-clock for the call
  error?: string; // set when !ok
}

export interface Provider {
  decide<T = unknown>(args: DecideArgs): Promise<DecideResult<T>>;
  generate(args: GenerateArgs): Promise<GenerateResult>;
}
