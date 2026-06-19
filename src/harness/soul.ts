// SOUL loader. The persona lives in a single, user-editable `SOUL.md` at the
// working directory and is carried into the Voice call-site only (ADR-0006).
// Read raw — the file's prose *is* the persona, so there is no sensible built-in
// fallback; a missing file is a clear, loud error rather than a silent empty
// voice.

import { readFileSync } from "node:fs";

export function loadSoul(opts: { cwd?: string } = {}): string {
  const path = `${opts.cwd ?? process.cwd()}/SOUL.md`;
  try {
    return readFileSync(path, "utf8").trim();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`grug has no soul: ${path} not found`);
    }
    throw e;
  }
}
