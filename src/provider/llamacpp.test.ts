import { describe, expect, it, vi } from "vitest";
import { createLogger, type LogEvent, LogLevel } from "../logging/logger.ts";
import { createLlamaCppProvider } from "./llamacpp.ts";

// A real logger wired to a capturing sink — exercises the actual level filtering
// (and isEnabled) the provider relies on. Defaults to Info, like production.
function recording(minLevel?: LogLevel) {
  const events: LogEvent[] = [];
  const logger = createLogger({ minLevel, sink: { write: (_level, event) => events.push(event) } });
  return { events, logger };
}

function chatResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// A fuller response carrying the metadata grugling logs (finish_reason, usage,
// timings), modelled on a real llama.cpp reply.
function fullResponse(opts: {
  content: string;
  finishReason?: string;
  usage?: object;
  timings?: object;
}): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: opts.content }, finish_reason: opts.finishReason ?? "stop" }],
      usage: opts.usage,
      timings: opts.timings,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const GRAMMAR = `root ::= "{" ws "\\"route\\"" ws ":" ws val ws "}"\nval ::= "\\"chat\\""\nws ::= " "?`;

describe("createLlamaCppProvider", () => {
  it("drives llama.cpp with a top-level GBNF grammar and returns the parsed decision", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => chatResponse('{"route":"chat"}'));
    const { events, logger } = recording();
    const provider = createLlamaCppProvider({
      baseUrl: "http://127.0.0.1:8080/v1/",
      model: "test-model",
      fetchImpl,
      logger,
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

  it("reports parseable-but-out-of-vocabulary output as non-conformant, not a decision", async () => {
    const { events, logger } = recording();
    const provider = createLlamaCppProvider({
      baseUrl: "http://127.0.0.1:8080/v1",
      model: "m",
      fetchImpl: (async () => chatResponse('{"route":"banana"}')) as unknown as typeof fetch,
      logger,
    });
    // Server replied (object parsed) but the value isn't in the enum — a sign the
    // grammar was ignored. Must surface as a logged failure, never accepted.
    const result = await provider.decide({
      user: "x",
      grammar: GRAMMAR,
      conformsTo: (v) => (v as { route?: string }).route === "chat",
    });
    expect(result.ok).toBe(true);
    expect(result.conformant).toBe(false);
    expect(result.value).toBeNull();
    expect(events[0]).toMatchObject({ event: "model_call", ok: true, conformant: false });
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

  it("disables model-side reasoning when reasoning is false", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => chatResponse('{"route":"chat"}'));
    const provider = createLlamaCppProvider({ baseUrl: "http://h/v1", model: "m", fetchImpl, reasoning: false });
    await provider.decide({ user: "x", grammar: GRAMMAR });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("leaves reasoning to the server when reasoning is not set", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => chatResponse('{"route":"chat"}'));
    const provider = createLlamaCppProvider({ baseUrl: "http://h/v1", model: "m", fetchImpl });
    await provider.decide({ user: "x", grammar: GRAMMAR });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string);
    expect(body.chat_template_kwargs).toBeUndefined();
  });

  it("generate returns text and forwards a non-zero temperature", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => fullResponse({ content: "grug say hi" }));
    const provider = createLlamaCppProvider({ baseUrl: "http://h/v1", model: "m", fetchImpl });
    const result = await provider.generate({ user: "hi", maxTokens: 200, temperature: 0.4 });
    expect(result).toMatchObject({ ok: true, text: "grug say hi" });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string);
    expect(body.temperature).toBe(0.4);
    expect(body.max_tokens).toBe(200);
    expect(body.grammar).toBeUndefined(); // Voice is unconstrained
  });

  it("treats a length-truncated reply as a visible failure, not a silent partial", async () => {
    const { events, logger } = recording();
    const provider = createLlamaCppProvider({
      baseUrl: "http://h/v1",
      model: "m",
      fetchImpl: (async () => fullResponse({ content: "grug half-", finishReason: "length" })) as unknown as typeof fetch,
      logger,
    });
    const result = await provider.generate({ user: "hi" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/truncated/);
    expect(events[0]).toMatchObject({ ok: false, finishReason: "length" });
  });

  it("treats an empty completion as a visible failure", async () => {
    const provider = createLlamaCppProvider({
      baseUrl: "http://h/v1",
      model: "m",
      fetchImpl: (async () => fullResponse({ content: "" })) as unknown as typeof fetch,
    });
    const result = await provider.generate({ user: "hi" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/empty/);
  });

  it("logs usage, cache hits, and throughput metrics", async () => {
    const { events, logger } = recording();
    const provider = createLlamaCppProvider({
      baseUrl: "http://h/v1",
      model: "m",
      fetchImpl: (async () =>
        fullResponse({
          content: "grug say hi",
          usage: { prompt_tokens: 207, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 197 } },
          timings: { predicted_per_second: 28.4 },
        })) as unknown as typeof fetch,
      logger,
    });
    await provider.generate({ user: "hi" });
    expect(events[0]).toMatchObject({
      finishReason: "stop",
      promptTokens: 207,
      completionTokens: 12,
      cachedTokens: 197,
      tokensPerSecond: 28,
    });
  });

  it("attaches the full request and response to a decide event at Debug (verbose)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => chatResponse('{"route":"chat"}'));
    const { events, logger } = recording(LogLevel.Debug);
    const provider = createLlamaCppProvider({ baseUrl: "http://h/v1", model: "m", fetchImpl, logger });
    await provider.decide({ user: "hi", system: "classify", grammar: GRAMMAR, callSite: "route" });

    expect(events[0]!.request).toMatchObject({
      model: "m",
      grammar: GRAMMAR,
      messages: [
        { role: "system", content: "classify" },
        { role: "user", content: "hi" },
      ],
    });
    expect(events[0]!.response).toMatchObject({ choices: [{ message: { content: '{"route":"chat"}' } }] });
  });

  it("omits request/response below Debug (the default Info path)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => chatResponse('{"route":"chat"}'));
    const { events, logger } = recording();
    const provider = createLlamaCppProvider({ baseUrl: "http://h/v1", model: "m", fetchImpl, logger });
    await provider.decide({ user: "hi", grammar: GRAMMAR });

    expect(events[0]!.request).toBeUndefined();
    expect(events[0]!.response).toBeUndefined();
  });

  it("captures the full request/response for a generate (Voice) call at Debug", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => fullResponse({ content: "grug say hi" }));
    const { events, logger } = recording(LogLevel.Debug);
    const provider = createLlamaCppProvider({ baseUrl: "http://h/v1", model: "m", fetchImpl, logger });
    await provider.generate({ user: "hi", maxTokens: 200, temperature: 0.4 });

    expect(events[0]!.request).toMatchObject({ max_tokens: 200, temperature: 0.4 });
    expect(events[0]!.response).toMatchObject({ choices: [{ message: { content: "grug say hi" } }] });
  });

  it("at Debug, surfaces the request and the full (untruncated) error body on a failed call", async () => {
    const longBody = "boom-".repeat(100); // 500 chars — past the 300-char `raw` excerpt
    const { events, logger } = recording(LogLevel.Debug);
    const provider = createLlamaCppProvider({
      baseUrl: "http://h/v1",
      model: "m",
      fetchImpl: (async () => new Response(longBody, { status: 500 })) as unknown as typeof fetch,
      logger,
    });
    const result = await provider.decide({ user: "x", grammar: GRAMMAR });

    expect(events[0]!.request).toMatchObject({ model: "m" });
    expect(events[0]!.response).toBe(longBody); // verbose gets the whole body
    expect(result.raw.length).toBe(300); // the user-facing excerpt stays truncated
  });
});
