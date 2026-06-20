import { describe, expect, it } from "vitest";
import { createJsonlSink, createLogger, type LogEvent, LogLevel } from "./logger.ts";

describe("createLogger", () => {
  function recording(minLevel?: LogLevel) {
    const events: Array<{ level: LogLevel; event: LogEvent }> = [];
    const logger = createLogger({ minLevel, sink: { write: (level, event) => events.push({ level, event }) } });
    return { logger, events };
  }

  it("routes each convenience method to its level", () => {
    const { logger, events } = recording(LogLevel.Trace);
    logger.debug({ event: "a" });
    logger.info({ event: "b" });
    logger.warn({ event: "c" });
    logger.error({ event: "d" });
    expect(events.map((e) => e.level)).toEqual([LogLevel.Debug, LogLevel.Info, LogLevel.Warn, LogLevel.Error]);
  });

  it("drops events below the minimum level (default Info)", () => {
    const { logger, events } = recording();
    logger.debug({ event: "hidden" });
    logger.info({ event: "shown" });
    expect(events).toHaveLength(1);
    expect(events[0]!.event).toMatchObject({ event: "shown" });
  });

  it("isEnabled reflects the minimum level", () => {
    const { logger } = recording(LogLevel.Info);
    expect(logger.isEnabled(LogLevel.Debug)).toBe(false);
    expect(logger.isEnabled(LogLevel.Info)).toBe(true);
    expect(logger.isEnabled(LogLevel.Error)).toBe(true);
  });

  it("None suppresses everything, including critical", () => {
    const { logger, events } = recording(LogLevel.None);
    logger.error({ event: "x" });
    logger.log(LogLevel.Critical, { event: "y" });
    expect(events).toHaveLength(0);
    expect(logger.isEnabled(LogLevel.Critical)).toBe(false);
  });

  it("the JSONL sink writes one line per event with a level field", () => {
    const lines: string[] = [];
    const logger = createLogger({ minLevel: LogLevel.Debug, sink: createJsonlSink((line) => lines.push(line)) });
    logger.info({ event: "model_call", callSite: "route", ms: 12, conformant: true });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({
      level: "info",
      event: "model_call",
      callSite: "route",
      ms: 12,
      conformant: true,
    });
  });
});
