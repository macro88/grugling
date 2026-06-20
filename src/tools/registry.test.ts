import { describe, expect, it } from "vitest";
import { enumDecisionSchema } from "../provider/gbnf.ts";
import { createRegistry } from "./registry.ts";
import type { Tool } from "./tool.ts";

function fakeTool(name: string): Tool {
  return {
    name,
    description: `${name} desc`,
    inputSchema: enumDecisionSchema("mode", ["x"]),
    meta: { trust: "trusted", risk: "low" },
    execute: () => ({ ok: true, raw: name, trust: "trusted" }),
  };
}

describe("createRegistry", () => {
  it("looks tools up by name and lists them in registration order", () => {
    const a = fakeTool("a");
    const b = fakeTool("b");
    const registry = createRegistry([a, b]);
    expect(registry.get("a")).toBe(a);
    expect(registry.get("b")).toBe(b);
    expect(registry.get("missing")).toBeUndefined();
    expect(registry.list()).toEqual([a, b]);
  });

  it("rejects duplicate tool names (a drop-in footgun)", () => {
    expect(() => createRegistry([fakeTool("a"), fakeTool("a")])).toThrow(/duplicate/);
  });
});
