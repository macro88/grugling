import { describe, expect, it } from "vitest";
import { enumDecisionSchema } from "../provider/gbnf.ts";
import type { DecideArgs, DecideResult, Provider } from "../provider/provider.ts";
import type { Tool } from "../tools/tool.ts";
import { decide, type Fact } from "./decide.ts";

const nowTool: Tool = {
  name: "now",
  description: "report the current date and/or time (UTC)",
  inputSchema: enumDecisionSchema("format", ["date", "time", "datetime"]),
  meta: { trust: "trusted", risk: "low" },
  execute: () => ({ ok: true, raw: "2026-06-20", trust: "trusted" }),
};

function scriptedProvider(value: unknown): { provider: Provider; calls: DecideArgs[] } {
  const calls: DecideArgs[] = [];
  const provider: Provider = {
    async decide<T>(args: DecideArgs): Promise<DecideResult<T>> {
      calls.push(args);
      return { ok: true, conformant: true, value: value as T, raw: JSON.stringify(value), ms: 1 };
    },
    async generate() {
      throw new Error("decide should not call generate");
    },
  };
  return { provider, calls };
}

describe("decide", () => {
  it("asks the Provider to choose a tool-or-finish under a grammar built from the in-scope tools", async () => {
    const { provider, calls } = scriptedProvider({ tool: "now", args: { format: "time" } });

    const result = await decide(provider, { tools: [nowTool], facts: [], message: "what time is it" });

    expect(result.value).toEqual({ tool: "now", args: { format: "time" } });
    const call = calls[0]!;
    expect(call.callSite).toBe("decide");
    expect(call.user).toBe("what time is it");
    // Grammar offers the tool branch and finish.
    expect(call.grammar).toContain(`"\\"now\\""`);
    expect(call.grammar).toContain("finish");
    // The tool's name + description are in scope so the model can pick.
    expect(call.system).toContain("now");
    expect(call.system).toContain("report the current date");
    // Validator catches out-of-vocabulary output.
    expect(call.conformsTo?.({ tool: "now", args: { format: "time" } })).toBe(true);
    expect(call.conformsTo?.({ tool: "rm", args: {} })).toBe(false);
  });

  it("renders the facts gathered so far into the prompt (no growing transcript, fixed slots)", async () => {
    const { provider, calls } = scriptedProvider({ tool: "finish" });
    const facts: Fact[] = [
      { tool: "now", args: { format: "time" }, ok: true, summary: "14:05:09 UTC", trust: "trusted", rawPointer: "0" },
    ];

    await decide(provider, { tools: [nowTool], facts, message: "what time is it" });

    expect(calls[0]!.system).toContain("14:05:09 UTC");
  });
});
