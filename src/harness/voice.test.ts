import { describe, expect, it } from "vitest";
import type { GenerateArgs, GenerateResult, Provider } from "../provider/provider.ts";
import { VOICE_INSTRUCTION, voice } from "./voice.ts";

// Fake Provider capturing the Voice generation. `decide` is unused here.
function scriptedProvider(text: string): { provider: Provider; calls: GenerateArgs[] } {
  const calls: GenerateArgs[] = [];
  const provider: Provider = {
    async decide() {
      throw new Error("voice should not call decide");
    },
    async generate(args: GenerateArgs): Promise<GenerateResult> {
      calls.push(args);
      return { ok: true, text, ms: 1 };
    },
  };
  return { provider, calls };
}

describe("voice", () => {
  it("generates an unconstrained reply with SOUL injected into the system slot", async () => {
    const { provider, calls } = scriptedProvider("grug say hi");

    const result = await voice(provider, {
      soul: "# SOUL\ngrug terse",
      message: "hello there",
      maxTokens: 200,
      temperature: 0.4,
    });

    expect(result.text).toBe("grug say hi");
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.callSite).toBe("voice");
    expect(call.user).toBe("hello there");
    // Fixed-slot assembly: persona first, then the per-call-site instruction.
    expect(call.system).toBe(`# SOUL\ngrug terse\n\n${VOICE_INSTRUCTION}`);
    // The host-sized reply budget and temperature are forwarded to the Provider.
    expect(call.maxTokens).toBe(200);
    expect(call.temperature).toBe(0.4);
  });
});
