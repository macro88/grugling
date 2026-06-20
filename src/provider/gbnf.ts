// Schema → GBNF compiler.
//
// GBNF is the only constraint path that works on the target llama.cpp build —
// json_schema / json_object return empty content (ADR-0002). So every decision
// call-site turns its input schema into a grammar through here, and the Provider
// drives the model with a top-level `grammar`.
//
// Slice 1 covers the single shape the walking skeleton needs: a *closed-enum
// decision* — a JSON object whose properties are each a fixed set of string
// literals (e.g. { "route": "chat" | "task" }). Later slices extend this to
// richer tool-input schemas.

export interface EnumProperty {
  type: "string";
  enum: string[];
}

export interface EnumDecisionSchema {
  type: "object";
  properties: Record<string, EnumProperty>;
  required?: string[];
  additionalProperties?: false;
}

// The canonical closed-enum decision schema for a single field.
export function enumDecisionSchema(field: string, values: string[]): EnumDecisionSchema {
  return {
    type: "object",
    properties: { [field]: { type: "string", enum: values } },
    required: [field],
    additionalProperties: false,
  };
}

// A GBNF string literal that matches the *JSON token* for `value`. The text the
// model must emit is `JSON.stringify(value)` (e.g. the 6 chars `"chat"`); we then
// escape that text for GBNF (`\` → `\\`, `"` → `\"`) and wrap it in quotes. So
// "chat" becomes `"\"chat\""`, matching the spike's hand-written grammar.
function gbnfLiteral(value: string): string {
  const json = JSON.stringify(value);
  const escaped = json.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

// Whether a parsed value actually conforms to the decision schema: an object
// with exactly the schema's keys, each holding one of that property's enum
// values. The GBNF grammar enforces this *when the server honours it*; this
// check is how the harness verifies it did — so out-of-vocabulary output (a
// sign the grammar was ignored) is caught and logged as a failure, never
// silently accepted (ADR-0002).
export function matchesEnumSchema(schema: EnumDecisionSchema, value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(schema.properties);
  if (Object.keys(obj).length !== keys.length) return false; // additionalProperties: false
  return keys.every((key) => {
    const v = obj[key];
    return typeof v === "string" && schema.properties[key]!.enum.includes(v);
  });
}

export function compileToGbnf(schema: EnumDecisionSchema): string {
  const keys = Object.keys(schema.properties);
  if (keys.length === 0) {
    throw new Error("compileToGbnf: schema has no properties");
  }

  const rules: string[] = [];
  const root: string[] = ['"{"', "ws"];

  keys.forEach((key, i) => {
    const prop = schema.properties[key];
    if (prop?.type !== "string" || !Array.isArray(prop.enum) || prop.enum.length === 0) {
      throw new Error(`compileToGbnf: property "${key}" must be a non-empty string enum`);
    }
    // GBNF rule names allow [a-zA-Z0-9-] only — an underscore silently
    // invalidates the whole grammar (llama.cpp then falls back to unconstrained).
    const ruleName = `val-${i}`;
    rules.push(`${ruleName} ::= ${prop.enum.map(gbnfLiteral).join(" | ")}`);
    if (i > 0) root.push('"," ws');
    root.push(gbnfLiteral(key), "ws", '":"', "ws", ruleName, "ws");
  });
  root.push('"}"');

  return [`root ::= ${root.join(" ")}`, ...rules, `ws ::= " "?`].join("\n");
}

// ---------------------------------------------------------------------------
// The Decide grammar (slice 3).
//
// Decide chooses, at each loop step, one of the in-scope tools (with its args)
// or to finish (CONTEXT.md › Decide). The grammar is generated from the tools'
// input schemas — adding a tool to the registry changes the grammar with no
// harness edit (ADR-0001/0002). The decision JSON is one of:
//   { "tool": "<name>", "args": { ... } }   — call a tool
//   { "tool": "finish" }                     — stop and answer
//
// `args` is each tool's own enum-object input schema (the same shape Route uses,
// reused per-tool). "finish" is reserved and can never be a tool name.

export const FINISH = "finish";

// The structural slice of a Tool the compiler needs — kept tool-agnostic so the
// Provider layer never depends on the Tool contract (the arrow points one way:
// tools → gbnf, never gbnf → tools).
export interface ToolDecl {
  name: string;
  inputSchema: EnumDecisionSchema;
}

// GBNF for one tool's args object, named off `ref` so per-tool rules never
// collide. An empty schema (a no-arg tool) compiles to the empty object `{}`.
function argsRules(schema: EnumDecisionSchema, ref: string): string[] {
  const keys = Object.keys(schema.properties);
  if (keys.length === 0) return [`${ref} ::= "{" ws "}"`];

  const valRules: string[] = [];
  const obj: string[] = ['"{"', "ws"];
  keys.forEach((key, j) => {
    const prop = schema.properties[key];
    if (prop?.type !== "string" || !Array.isArray(prop.enum) || prop.enum.length === 0) {
      throw new Error(`compileDecideGrammar: arg "${key}" must be a non-empty string enum`);
    }
    const valRule = `${ref}-${j}`;
    valRules.push(`${valRule} ::= ${prop.enum.map(gbnfLiteral).join(" | ")}`);
    if (j > 0) obj.push('"," ws');
    obj.push(gbnfLiteral(key), "ws", '":"', "ws", valRule, "ws");
  });
  obj.push('"}"');
  return [`${ref} ::= ${obj.join(" ")}`, ...valRules];
}

export function compileDecideGrammar(tools: ToolDecl[]): string {
  if (tools.length === 0) throw new Error("compileDecideGrammar: no tools in scope");
  if (tools.some((t) => t.name === FINISH)) {
    throw new Error(`compileDecideGrammar: "${FINISH}" is reserved and cannot be a tool name`);
  }

  const toolRules: string[] = [];
  const branches: string[] = [];
  tools.forEach((tool, i) => {
    const argsRef = `arg-${i}`;
    const toolRule = `tool-${i}`;
    branches.push(toolRule);
    toolRules.push(
      `${toolRule} ::= "{" ws ${gbnfLiteral("tool")} ws ":" ws ${gbnfLiteral(tool.name)} ws "," ws ${gbnfLiteral("args")} ws ":" ws ${argsRef} ws "}"`,
      ...argsRules(tool.inputSchema, argsRef),
    );
  });
  branches.push(FINISH);

  return [
    `root ::= ${branches.join(" | ")}`,
    ...toolRules,
    `${FINISH} ::= "{" ws ${gbnfLiteral("tool")} ws ":" ws ${gbnfLiteral(FINISH)} ws "}"`,
    `ws ::= " "?`,
  ].join("\n");
}

// Whether a parsed Decide value actually conforms: either { tool: "finish" }
// exactly, or { tool: <known tool>, args: <valid for that tool> }. This is how
// the harness verifies the server honoured the grammar — out-of-vocabulary
// output (a sign the grammar was ignored) is caught and logged as a failure,
// never silently accepted (ADR-0002).
export function matchesDecideSchema(tools: ToolDecl[], value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;

  if (obj.tool === FINISH) return Object.keys(obj).length === 1;

  const tool = tools.find((t) => t.name === obj.tool);
  if (!tool) return false;
  const keys = Object.keys(obj);
  if (keys.length !== 2 || !("args" in obj)) return false;
  return matchesEnumSchema(tool.inputSchema, obj.args);
}
