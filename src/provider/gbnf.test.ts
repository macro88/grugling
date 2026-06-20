import { describe, expect, it } from "vitest";
import {
  compileDecideGrammar,
  compileToGbnf,
  enumDecisionSchema,
  matchesDecideSchema,
  matchesEnumSchema,
  type ToolDecl,
} from "./gbnf.ts";

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

describe("matchesEnumSchema", () => {
  const schema = enumDecisionSchema("route", ["chat", "task"]);

  it("accepts an object whose value is in the enum", () => {
    expect(matchesEnumSchema(schema, { route: "chat" })).toBe(true);
    expect(matchesEnumSchema(schema, { route: "task" })).toBe(true);
  });

  it("rejects an out-of-vocabulary value (grammar-ignored output)", () => {
    expect(matchesEnumSchema(schema, { route: "banana" })).toBe(false);
  });

  it("rejects extra keys, missing keys, and non-objects", () => {
    expect(matchesEnumSchema(schema, { route: "chat", extra: 1 })).toBe(false);
    expect(matchesEnumSchema(schema, {})).toBe(false);
    expect(matchesEnumSchema(schema, "chat")).toBe(false);
    expect(matchesEnumSchema(schema, null)).toBe(false);
    expect(matchesEnumSchema(schema, ["chat"])).toBe(false);
  });
});

describe("compileDecideGrammar", () => {
  const now: ToolDecl = { name: "now", inputSchema: enumDecisionSchema("format", ["date", "time", "datetime"]) };

  it("compiles a tool-or-finish grammar from the in-scope tools' input schemas", () => {
    const grammar = compileDecideGrammar([now]);
    expect(grammar).toBe(
      [
        `root ::= tool-0 | finish`,
        `tool-0 ::= "{" ws "\\"tool\\"" ws ":" ws "\\"now\\"" ws "," ws "\\"args\\"" ws ":" ws arg-0 ws "}"`,
        `arg-0 ::= "{" ws "\\"format\\"" ws ":" ws arg-0-0 ws "}"`,
        `arg-0-0 ::= "\\"date\\"" | "\\"time\\"" | "\\"datetime\\""`,
        `finish ::= "{" ws "\\"tool\\"" ws ":" ws "\\"finish\\"" ws "}"`,
        `ws ::= " "?`,
      ].join("\n"),
    );
  });

  it("offers one branch per tool plus finish, with per-tool arg rules that never collide", () => {
    const b: ToolDecl = { name: "b", inputSchema: enumDecisionSchema("mode", ["x"]) };
    const grammar = compileDecideGrammar([now, b]);
    expect(grammar).toContain(`root ::= tool-0 | tool-1 | finish`);
    expect(grammar).toContain(`arg-0-0 ::= "\\"date\\"" | "\\"time\\"" | "\\"datetime\\""`);
    expect(grammar).toContain(`arg-1-0 ::= "\\"x\\""`);
  });

  it("compiles a no-arg tool to an empty args object", () => {
    const ping: ToolDecl = { name: "ping", inputSchema: { type: "object", properties: {} } };
    const grammar = compileDecideGrammar([ping]);
    expect(grammar).toContain(`arg-0 ::= "{" ws "}"`);
  });

  it("uses only hyphenated rule names (GBNF rejects underscores)", () => {
    const grammar = compileDecideGrammar([now]);
    expect(grammar).not.toMatch(/[a-z]_[a-z0-9]/);
  });

  it("throws on an empty tool set", () => {
    expect(() => compileDecideGrammar([])).toThrow(/no tools/);
  });

  it("rejects a tool that tries to claim the reserved finish name", () => {
    const bad: ToolDecl = { name: "finish", inputSchema: { type: "object", properties: {} } };
    expect(() => compileDecideGrammar([bad])).toThrow(/reserved/);
  });
});

describe("matchesDecideSchema", () => {
  const now: ToolDecl = { name: "now", inputSchema: enumDecisionSchema("format", ["date", "time", "datetime"]) };
  const tools = [now];

  it("accepts a finish decision and a well-formed tool call", () => {
    expect(matchesDecideSchema(tools, { tool: "finish" })).toBe(true);
    expect(matchesDecideSchema(tools, { tool: "now", args: { format: "time" } })).toBe(true);
  });

  it("rejects an unknown tool, bad args, and a finish carrying extra keys", () => {
    expect(matchesDecideSchema(tools, { tool: "rm", args: {} })).toBe(false);
    expect(matchesDecideSchema(tools, { tool: "now", args: { format: "banana" } })).toBe(false);
    expect(matchesDecideSchema(tools, { tool: "now" })).toBe(false); // missing args
    expect(matchesDecideSchema(tools, { tool: "finish", args: {} })).toBe(false);
    expect(matchesDecideSchema(tools, null)).toBe(false);
  });

  it("accepts an empty args object for a no-arg tool", () => {
    const ping: ToolDecl = { name: "ping", inputSchema: { type: "object", properties: {} } };
    expect(matchesDecideSchema([ping], { tool: "ping", args: {} })).toBe(true);
    expect(matchesDecideSchema([ping], { tool: "ping", args: { extra: "x" } })).toBe(false);
  });
});
