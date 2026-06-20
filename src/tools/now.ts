// The time/date tool — the read-only, trusted tool that proves the task path
// (issue #4). It reports the current date/time in UTC, so its output is
// unambiguous and the tool is deterministic given a clock. The clock is
// injectable for tests; production uses the system clock.
//
// Its `format` arg is a closed enum, so the schema→GBNF compiler turns it into a
// real (args-bearing) Decide branch — exercising "Decide picks a tool with args"
// end to end, not just a no-arg selection.

import { enumDecisionSchema } from "../provider/gbnf.ts";
import type { Tool } from "./tool.ts";

export const NOW_FORMATS = ["date", "time", "datetime"] as const;

const pad = (n: number): string => String(n).padStart(2, "0");

function format(d: Date, fmt: string): string {
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  if (fmt === "date") return date;
  if (fmt === "time") return time;
  return `${date} ${time}`; // "datetime" and the safe default
}

export function createNowTool(opts: { now?: () => Date } = {}): Tool {
  const now = opts.now ?? (() => new Date());
  return {
    name: "now",
    description: "report the current date and/or time (UTC)",
    inputSchema: enumDecisionSchema("format", [...NOW_FORMATS]),
    meta: { trust: "trusted", risk: "low" },
    execute(args) {
      return { ok: true, raw: format(now(), args.format ?? ""), trust: "trusted" };
    },
  };
}
