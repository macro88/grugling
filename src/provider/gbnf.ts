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
