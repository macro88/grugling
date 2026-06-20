import { describe, expect, it } from "vitest";
import { createNowTool } from "./now.ts";

// A fixed clock makes the tool deterministic: 2026-06-20 14:05:09 UTC.
const fixed = () => new Date(Date.UTC(2026, 5, 20, 14, 5, 9));

describe("createNowTool", () => {
  it("is a read-only, trusted tool with a format arg the Decide grammar can use", () => {
    const tool = createNowTool({ now: fixed });
    expect(tool.name).toBe("now");
    expect(tool.meta.trust).toBe("trusted");
    expect(tool.inputSchema.properties.format!.enum).toEqual(["date", "time", "datetime"]);
  });

  it("formats date, time, and datetime in UTC, zero-padded", () => {
    const tool = createNowTool({ now: fixed });
    expect(tool.execute({ format: "date" })).toEqual({ ok: true, raw: "2026-06-20", trust: "trusted" });
    expect(tool.execute({ format: "time" })).toEqual({ ok: true, raw: "14:05:09 UTC", trust: "trusted" });
    expect(tool.execute({ format: "datetime" })).toEqual({ ok: true, raw: "2026-06-20 14:05:09 UTC", trust: "trusted" });
  });

  it("defaults to a full datetime when no recognised format is given", () => {
    const tool = createNowTool({ now: fixed });
    expect(tool.execute({})).toEqual({ ok: true, raw: "2026-06-20 14:05:09 UTC", trust: "trusted" });
  });
});
