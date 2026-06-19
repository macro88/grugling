import { describe, expect, it, vi } from "vitest";
import type { LogEvent } from "../logging/logger.ts";
import { createLlamaCppProvider } from "./llamacpp.ts";

function chatResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const GRAMMAR = `root ::= "{" ws "\\"route\\"" ws ":" ws val ws "}"\nval ::= "\\"chat\\""\nws ::= " "?`;

describe("createLlamaCppProvider", () => {
  it("drives llama.cpp with a top-level GBNF grammar and returns the parsed decision", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => chatResponse('{"route":"chat"}'));
    const events: LogEvent[] = [];
    const provider = createLlamaCppProvider({
      baseUrl: "http://127.0.0.1:8080/v1/",
      model: "test-model",
      fetchImpl,
      logger: { log: (e) => events.push(e) },
    });

    const result = await provider.decide({ user: "hi", system: "classify", grammar: GRAMMAR, callSite: "route" });

    expect(result).toMatchObject({ ok: true, conformant: true, value: { route: "chat" } });

    // The request: trailing slash collapsed, GBNF passed top-level, deterministic.
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:8080/v1/chat/completions");
    const body = JSON.parse(init!.body as string);
    expect(body.grammar).toBe(GRAMMAR);
    expect(body.temperature).toBe(0);
    expect(body.model).toBe("test-model");
    expect(body.messages).toEqual([
      { role: "system", content: "classify" },
      { role: "user", content: "hi" },
    ]);

    // Exactly one structured event per model call.
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: "model_call", callSite: "route", ok: true, conformant: true });
  });

  it("reports a non-2xx response as a transport failure, not a decision", async () => {
    const provider = createLlamaCppProvider({
      baseUrl: "http://127.0.0.1:8080/v1",
      model: "m",
      fetchImpl: (async () => new Response("upstream boom", { status: 500 })) as unknown as typeof fetch,
    });
    const result = await provider.decide({ user: "x", grammar: GRAMMAR });
    expect(result.ok).toBe(false);
    expect(result.conformant).toBe(false);
    expect(result.error).toBe("HTTP 500");
    expect(result.raw).toContain("upstream boom");
  });

  it("surfaces an unreachable server as a clear error rather than throwing", async () => {
    const provider = createLlamaCppProvider({
      baseUrl: "http://127.0.0.1:8080/v1",
      model: "m",
      fetchImpl: (async () => {
        throw new Error("fetch failed: ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    const result = await provider.decide({ user: "x", grammar: GRAMMAR });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("turns an aborted (timed-out) call into a timeout error", async () => {
    const provider = createLlamaCppProvider({
      baseUrl: "http://127.0.0.1:8080/v1",
      model: "m",
      fetchImpl: (async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }) as unknown as typeof fetch,
    });
    const result = await provider.decide({ user: "x", grammar: GRAMMAR, timeoutMs: 5 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timed out after 5ms/);
  });
});
