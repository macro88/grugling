import { describe, expect, it } from "vitest";
import type { DecideArgs, DecideResult, GenerateArgs, GenerateResult, Provider } from "../provider/provider.ts";
import type { LogEvent } from "../logging/logger.ts";
import { createRegistry } from "../tools/registry.ts";
import { createNowTool } from "../tools/now.ts";
import { createDeterministicCompressor } from "./compress.ts";
import type { DecideValue } from "./decide.ts";
import { handleMessage, type HandleOptions } from "./pipeline.ts";

// Scripted fake Provider — the primary seam (PRD › Testing Decisions). Route and
// Decide both hit `decide`, so we branch on the call-site: "route" returns the
// route decision, "decide" consumes a scripted sequence (last entry repeats).
interface Script {
  route?: DecideResult<{ route: string }>;
  decides?: DecideResult<DecideValue>[];
  voice?: GenerateResult;
}

function scriptedProvider(script: Script): {
  provider: Provider;
  decideCalls: DecideArgs[];
  generateCalls: GenerateArgs[];
} {
  const decideCalls: DecideArgs[] = [];
  const generateCalls: GenerateArgs[] = [];
  let di = 0;
  const provider: Provider = {
    async decide<T>(args: DecideArgs): Promise<DecideResult<T>> {
      decideCalls.push(args);
      if (args.callSite === "route") {
        return (script.route ?? { ok: true, conformant: true, value: { route: "chat" }, raw: "", ms: 1 }) as DecideResult<T>;
      }
      const seq = script.decides ?? [{ ok: true, conformant: true, value: { tool: "finish" }, raw: "", ms: 1 }];
      const d = seq[Math.min(di, seq.length - 1)]!;
      di++;
      return d as DecideResult<T>;
    },
    async generate(args: GenerateArgs): Promise<GenerateResult> {
      generateCalls.push(args);
      return script.voice ?? { ok: true, text: "grug reply", ms: 1 };
    },
  };
  return { provider, decideCalls, generateCalls };
}

const SOUL = "# SOUL\ngrug terse";
const FIXED_CLOCK = () => new Date(Date.UTC(2026, 5, 20, 14, 5, 9));

function options(extra: Partial<HandleOptions> = {}): HandleOptions {
  return {
    soul: SOUL,
    voiceMaxTokens: 256,
    voiceTemperature: 0,
    registry: createRegistry([createNowTool({ now: FIXED_CLOCK })]),
    compressor: createDeterministicCompressor(),
    loopCap: 5,
    decisionMaxTokens: 64,
    ...extra,
  };
}

const route = (value: string): DecideResult<{ route: string }> => ({ ok: true, conformant: true, value: { route: value }, raw: "", ms: 1 });
const toolCall = (tool: string, args: Record<string, string>): DecideResult<DecideValue> => ({ ok: true, conformant: true, value: { tool, args }, raw: "", ms: 1 });
const finish: DecideResult<DecideValue> = { ok: true, conformant: true, value: { tool: "finish" }, raw: "", ms: 1 };

describe("handleMessage", () => {
  it("routes a chat message to a persona Voice reply", async () => {
    const { provider, generateCalls } = scriptedProvider({ route: route("chat"), voice: { ok: true, text: "grug say hi", ms: 1 } });

    const result = await handleMessage(provider, "hello", options());

    expect(result).toEqual({ kind: "chat", reply: "grug say hi" });
    expect(generateCalls).toHaveLength(1);
    expect(generateCalls[0]!.system).toContain(SOUL);
    expect(generateCalls[0]!.user).toBe("hello");
  });

  it("runs a task end-to-end: Route → Decide picks a tool → execute → Voice answers from the facts", async () => {
    const { provider, generateCalls } = scriptedProvider({
      route: route("task"),
      decides: [toolCall("now", { format: "datetime" }), finish],
      voice: { ok: true, text: "grug say 2pm", ms: 1 },
    });

    const result = await handleMessage(provider, "what time is it", options());

    expect(result).toEqual({ kind: "task", reply: "grug say 2pm" });
    // Voice spoke once, and the tool's fact (the real time) reached it.
    expect(generateCalls).toHaveLength(1);
    expect(generateCalls[0]!.user).toContain("2026-06-20 14:05:09 UTC");
    expect(generateCalls[0]!.user).toContain("what time is it");
  });

  it("surfaces a non-conformant Decide as a logged fallback, never a silent chat reply", async () => {
    const events: LogEvent[] = [];
    const garbled: DecideResult<DecideValue> = { ok: true, conformant: false, value: null, raw: '"banana"', ms: 1 };
    const { provider, generateCalls } = scriptedProvider({ route: route("task"), decides: [garbled] });

    const result = await handleMessage(provider, "what time is it", options({ logger: { log: (e) => events.push(e) } }));

    expect(result).toMatchObject({ kind: "task", fallback: true });
    expect(generateCalls).toHaveLength(0); // not voiced as a normal reply
    expect(events.some((e) => e.event === "fallback" && e.callSite === "decide")).toBe(true);
  });

  it("surfaces an unreachable model at Route as an error", async () => {
    const { provider, generateCalls } = scriptedProvider({ route: { ok: false, conformant: false, value: null, raw: "", ms: 1, error: "ECONNREFUSED" } });

    const result = await handleMessage(provider, "hello", options());

    expect(result.kind).toBe("error");
    expect(generateCalls).toHaveLength(0);
  });

  it("surfaces a non-conformant Route decision as an error, never a silent chat", async () => {
    const { provider } = scriptedProvider({ route: { ok: true, conformant: false, value: null, raw: '"banana"', ms: 1 } });

    const result = await handleMessage(provider, "hello", options());

    expect(result.kind).toBe("error");
  });

  it("surfaces an unreachable model at Voice as an error", async () => {
    const { provider } = scriptedProvider({ route: route("chat"), voice: { ok: false, text: "", ms: 1, error: "timed out after 60000ms" } });

    const result = await handleMessage(provider, "hello", options());

    expect(result).toMatchObject({ kind: "error" });
  });
});
