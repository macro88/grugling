import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSoul } from "./soul.ts";

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "grug-soul-"));
}

describe("loadSoul", () => {
  it("reads SOUL.md from the cwd", () => {
    const dir = tmpDir();
    writeFileSync(join(dir, "SOUL.md"), "# SOUL\ngrug terse\n");
    expect(loadSoul({ cwd: dir })).toBe("# SOUL\ngrug terse");
  });

  it("throws a clear error when the soul file is missing", () => {
    expect(() => loadSoul({ cwd: tmpDir() })).toThrow(/grug has no soul/);
  });
});
