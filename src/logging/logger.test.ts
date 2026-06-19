import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.ts";

describe("createLogger", () => {
  it("writes each event as one JSON line", () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));
    logger.log({ event: "model_call", callSite: "route", ms: 12, conformant: true });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({
      event: "model_call",
      callSite: "route",
      ms: 12,
      conformant: true,
    });
  });
});
