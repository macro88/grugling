import { describe, expect, it } from "vitest";
import type { DecideArgs, DecideResult, GenerateArgs, GenerateResult, Provider } from "../provider/provider.ts";
import { handleMessage } from "./pipeline.ts";

// Scripted fake Provider — the primary seam (PRD › Testing Decisions). It scripts
// the Route decision and the Voice text, and records every call so we can assert
// dispatch and that SOUL reaches Voice.
interface Script {
  route?: DecideResult<{ route: string }>;
  voice?: GenerateResult;
}

function scriptedProvider(script: Script): {
  provider: Provider;
  decideCalls: DecideArgs[];
  generateCalls: GenerateArgs[];
} {
  const decideCalls: DecideArgs[] = [];
  const generateCalls: GenerateArgs[] = [];
  const provider: Provider = {
    async decide<T>(args: DecideArgs): Promise<DecideResult<T>> {
      decideCalls.push(args);
      return (script.route ?? { ok: true, conformant: true, value: { route: "chat" }, raw: "", ms: 1 }) as DecideResult<T>;
    },
    async generate(args: GenerateArgs): Promise<GenerateResult> {
      generateCalls.push(args);
      return script.voice ?? { ok: true, text: "grug reply", ms: 1 };
    },
  };
  return { provider, decideCalls, generateCalls };
}

const SOUL = "# SOUL\ngrug terse";

describe("handleMessage", () => {
  it("routes a chat message to a persona Voice reply", async () => {
    const { provider, generateCalls } = scriptedProvider({
      route: { ok: true, conformant: true, value: { route: "chat" }, raw: "", ms: 1 },
      voice: { ok: true, text: "grug say hi", ms: 1 },
    });

    const result = await handleMessage(provider, "hello", { soul: SOUL, voiceMaxTokens: 256 });

    expect(result).toEqual({ kind: "chat", reply: "grug say hi" });
    // Voice was dispatched, with the SOUL persona in scope.
    expect(generateCalls).toHaveLength(1);
    expect(generateCalls[0]!.system).toContain(SOUL);
    expect(generateCalls[0]!.user).toBe("hello");
  });

  it("routes a task message to the stub and does not invoke Voice", async () => {
    const { provider, generateCalls } = scriptedProvider({
      route: { ok: true, conformant: true, value: { route: "task" }, raw: "", ms: 1 },
    });

    const result = await handleMessage(provider, "summarise https://example.com", { soul: SOUL, voiceMaxTokens: 256 });

    expect(result.kind).toBe("task");
    expect(generateCalls).toHaveLength(0); // task path is stubbed — no Voice yet
  });

  it("surfaces an unreachable model at Route as an error", async () => {
    const { provider, generateCalls } = scriptedProvider({
      route: { ok: false, conformant: false, value: null, raw: "", ms: 1, error: "ECONNREFUSED" },
    });

    const result = await handleMessage(provider, "hello", { soul: SOUL, voiceMaxTokens: 256 });

    expect(result.kind).toBe("error");
    expect(generateCalls).toHaveLength(0);
  });

  it("surfaces a non-conformant Route decision as an error, never a silent chat", async () => {
    const { provider } = scriptedProvider({
      route: { ok: true, conformant: false, value: null, raw: '"banana"', ms: 1 },
    });

    const result = await handleMessage(provider, "hello", { soul: SOUL, voiceMaxTokens: 256 });

    expect(result.kind).toBe("error");
  });

  it("surfaces an unreachable model at Voice as an error", async () => {
    const { provider } = scriptedProvider({
      route: { ok: true, conformant: true, value: { route: "chat" }, raw: "", ms: 1 },
      voice: { ok: false, text: "", ms: 1, error: "timed out after 60000ms" },
    });

    const result = await handleMessage(provider, "hello", { soul: SOUL, voiceMaxTokens: 256 });

    expect(result).toMatchObject({ kind: "error" });
  });
});
