import { describe, expect, it } from "vitest";
import { parseArgs } from "./cli.ts";

// argv mirrors process.argv: [node, script, ...args].
const argv = (...args: string[]) => ["node", "cli.ts", ...args];

describe("parseArgs", () => {
  it("takes the first non-flag positional as the message", () => {
    expect(parseArgs(argv("what time is it"))).toMatchObject({ message: "what time is it", verbose: false });
  });

  it("detects --verbose before the message", () => {
    expect(parseArgs(argv("--verbose", "hi"))).toMatchObject({ message: "hi", verbose: true });
  });

  it("detects --verbose after the message", () => {
    expect(parseArgs(argv("hi", "--verbose"))).toMatchObject({ message: "hi", verbose: true });
  });

  it("has no message when only flags are given", () => {
    expect(parseArgs(argv("--verbose"))).toMatchObject({ message: undefined, verbose: true });
  });

  it("flags help for -h / --help", () => {
    expect(parseArgs(argv("-h")).help).toBe(true);
    expect(parseArgs(argv("--help")).help).toBe(true);
    expect(parseArgs(argv("hi")).help).toBe(false);
  });
});
