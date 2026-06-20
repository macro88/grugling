import { describe, expect, it } from "vitest";
import { createDeterministicCompressor } from "./compress.ts";

describe("createDeterministicCompressor", () => {
  it("passes short output through unchanged", () => {
    const c = createDeterministicCompressor();
    expect(c.compress("2026-06-20 14:05:09 UTC")).toBe("2026-06-20 14:05:09 UTC");
    expect(c.compress("")).toBe("");
  });

  it("keeps head and tail lines of a long output, marking what was dropped", () => {
    const c = createDeterministicCompressor({ headLines: 2, tailLines: 2, maxChars: 10_000 });
    const raw = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const out = c.compress(raw);
    expect(out).toContain("line 0");
    expect(out).toContain("line 1");
    expect(out).toContain("line 18");
    expect(out).toContain("line 19");
    expect(out).not.toContain("line 9");
    expect(out).toMatch(/16 lines omitted/);
  });

  it("always surfaces error/warning lines even from the dropped middle", () => {
    const c = createDeterministicCompressor({ headLines: 1, tailLines: 1, maxChars: 10_000 });
    const raw = ["start", "ok", "Error: disk full", "ok", "WARN: low memory", "ok", "end"].join("\n");
    const out = c.compress(raw);
    expect(out).toContain("Error: disk full");
    expect(out).toContain("WARN: low memory");
  });

  it("hard-caps the total character count so a noisy tool can't blow the budget", () => {
    const c = createDeterministicCompressor({ headLines: 100, tailLines: 100, maxChars: 50 });
    const out = c.compress("x".repeat(500));
    expect(out.length).toBeLessThanOrEqual(50);
  });
});
