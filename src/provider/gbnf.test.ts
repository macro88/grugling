import { describe, expect, it } from "vitest";
import { compileToGbnf, enumDecisionSchema } from "./gbnf.ts";

describe("compileToGbnf", () => {
  it("compiles a single closed-enum decision (the route grammar)", () => {
    const grammar = compileToGbnf(enumDecisionSchema("route", ["chat", "task"]));
    expect(grammar).toBe(
      [
        `root ::= "{" ws "\\"route\\"" ws ":" ws val-0 ws "}"`,
        `val-0 ::= "\\"chat\\"" | "\\"task\\""`,
        `ws ::= " "?`,
      ].join("\n"),
    );
  });

  it("matches the spike's hand-written { tool: enum } shape", () => {
    const grammar = compileToGbnf(enumDecisionSchema("tool", ["a", "b"]));
    expect(grammar).toContain(`root ::= "{" ws "\\"tool\\"" ws ":" ws val-0 ws "}"`);
    expect(grammar).toContain(`val-0 ::= "\\"a\\"" | "\\"b\\""`);
  });

  it("uses only hyphenated rule names (GBNF rejects underscores)", () => {
    const grammar = compileToGbnf(enumDecisionSchema("route", ["chat", "task"]));
    expect(grammar).not.toMatch(/[a-z]_[a-z0-9]/); // no underscore-bearing identifiers
  });

  it("separates multiple enum properties with a comma", () => {
    const grammar = compileToGbnf({
      type: "object",
      properties: {
        route: { type: "string", enum: ["chat"] },
        tone: { type: "string", enum: ["grug"] },
      },
    });
    expect(grammar).toContain(
      `root ::= "{" ws "\\"route\\"" ws ":" ws val-0 ws "," ws "\\"tone\\"" ws ":" ws val-1 ws "}"`,
    );
  });

  it("escapes quotes and backslashes so each alternative matches the value's JSON token", () => {
    const values = ['a"b', "c\\d"];
    const grammar = compileToGbnf(enumDecisionSchema("tool", values));
    const valLine = grammar.split("\n").find((l) => l.startsWith("val-0 ::= "))!;
    const literals = valLine.replace("val-0 ::= ", "").split(" | ");
    // Undo the GBNF escaping; what's left must be exactly JSON.stringify(value).
    const matched = literals.map((lit) => lit.slice(1, -1).replace(/\\(["\\])/g, "$1"));
    expect(matched).toEqual(values.map((v) => JSON.stringify(v)));
  });

  it("throws on an empty schema", () => {
    expect(() => compileToGbnf({ type: "object", properties: {} })).toThrow(/no properties/);
  });

  it("throws when a property has an empty enum", () => {
    expect(() => compileToGbnf(enumDecisionSchema("tool", []))).toThrow(/non-empty string enum/);
  });
});
