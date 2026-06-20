import { describe, expect, it } from "vitest";
import type { DecideArgs, DecideResult, Provider } from "../provider/provider.ts";
import { ROUTE_VALUES, route } from "./route.ts";

// Scripted fake Provider — the primary test seam (PRD › Testing Decisions).
// It records the call and returns a canned, conformant decision. Route never
// calls `generate`, so that arm just throws if exercised.
function scriptedProvider(value: unknown): { provider: Provider; calls: DecideArgs[] } {
  const calls: DecideArgs[] = [];
  const provider: Provider = {
    async decide<T>(args: DecideArgs): Promise<DecideResult<T>> {
      calls.push(args);
      return { ok: true, conformant: true, value: value as T, raw: JSON.stringify(value), ms: 1 };
    },
    async generate() {
      throw new Error("route should not call generate");
    },
  };
  return { provider, calls };
}

describe("route", () => {
  it("asks the Provider for a chat|task decision under a GBNF grammar", async () => {
    const { provider, calls } = scriptedProvider({ route: "task" });

    const result = await route(provider, "summarise https://example.com");

    expect(result.value).toEqual({ route: "task" });
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.callSite).toBe("route");
    expect(call.user).toBe("summarise https://example.com");
    expect(call.system).toBeTruthy();
    // The grammar constrains output to exactly the route enum.
    for (const v of ROUTE_VALUES) expect(call.grammar).toContain(`"\\"${v}\\""`);
    // It also passes a validator so out-of-vocabulary output is caught as non-conformant.
    expect(call.conformsTo?.({ route: "task" })).toBe(true);
    expect(call.conformsTo?.({ route: "banana" })).toBe(false);
  });
});
