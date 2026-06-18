// THROWAWAY runner for the grugling router validation spike.
//
// QUESTION (build-order step 1, ARCHITECTURE.md): can the small local model be a
// reliable, fast-enough router when its output is schema-constrained? Three bets:
//   1. Constrained decoding actually works on THIS runtime via the OpenAI API.
//   2. Routing is *correct* (not just conformant) — and does correctness hold as
//      the candidate tool set grows 3 → 8 → 15? (the ADR-0004 skill-narrowing bet)
//   3. Per-call latency at realistic prompt sizes is tolerable on this CPU.
//
// Run:  node prototypes/router-spike/spike.ts
// Env:  BASE_URL (default http://127.0.0.1:8080/v1)  MODEL (default: first /models)
//
// Prints a report; no persistence. Delete this shell once the question is answered
// (keep provider.ts). See NOTES.md to record the verdict.

import { ALL_METHODS, decide, type ConstraintMethod } from "./provider.ts";
import { CASES, candidateSet, TOOL_BY_NAME } from "./cases.ts";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:8080/v1";
const CONDITIONS = [3, 8, 15];

const b = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

async function resolveModel(): Promise<string> {
  if (process.env.MODEL) return process.env.MODEL;
  const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/models`);
  const json = (await res.json()) as any;
  const id = json?.data?.[0]?.id ?? json?.models?.[0]?.id;
  if (!id) throw new Error("could not resolve a model id from /models");
  return id;
}

// Mirrors the planned fixed-slot assembly: system role + a user slot listing the
// in-scope tools and the message to route.
function buildPrompt(promptText: string, candidates: string[]) {
  const system =
    "You are the router for a personal assistant. Choose exactly ONE tool to handle the user's message. " +
    'If no tool is appropriate, choose "chat". Answer only with the chosen tool name.';
  const lines = candidates.map((n) => `- ${n}: ${TOOL_BY_NAME.get(n)!.desc}`).join("\n");
  const user = `Available tools:\n${lines}\n\nUser message: "${promptText}"\n\nWhich tool?`;
  return { system, user, approxTokens: Math.round((system.length + user.length) / 4) };
}

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${((100 * n) / d).toFixed(0)}%`;
}

function stats(ms: number[]): { p50: number; p90: number; mean: number } {
  if (ms.length === 0) return { p50: 0, p90: 0, mean: 0 };
  const s = [...ms].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { p50: at(0.5), p90: at(0.9), mean: s.reduce((a, c) => a + c, 0) / s.length };
}

// ── Bet 1: which constraint method works on this runtime? ───────────────────
async function probeConstraint(model: string): Promise<ConstraintMethod | null> {
  console.log(b("\n[1] Constrained-decoding probe") + dim("  (one trivial call per method)"));
  const enumVals = ["system_health", "chat"];
  const prompt = buildPrompt("How much memory is free?", enumVals);
  let chosen: ConstraintMethod | null = null;
  for (const method of ALL_METHODS) {
    const r = await decide({
      baseUrl: BASE_URL,
      model,
      system: prompt.system,
      user: prompt.user,
      enum: enumVals,
      method,
      timeoutMs: 60_000,
    });
    const verdict = !r.ok
      ? red(`unsupported (${r.error ?? "error"})`)
      : r.conformant
        ? green(`OK → ${r.tool}`)
        : red(`non-conformant (raw: ${JSON.stringify(r.raw).slice(0, 60)})`);
    console.log(`  ${method.padEnd(22)} ${(r.ms | 0) + "ms"} ${verdict}`);
    if (r.ok && r.conformant && !chosen) chosen = method;
  }
  if (chosen) console.log(`  ${dim("→ using")} ${b(chosen)} ${dim("for the routing eval")}`);
  else console.log(red("  → no method produced conformant output. Bet 1 FAILS — see raw output above."));
  return chosen;
}

// ── Bets 2 & 3: routing correctness + latency across candidate-set sizes ─────
async function routingEval(model: string, method: ConstraintMethod) {
  console.log(b("\n[2/3] Routing correctness + latency") + dim("  (15 cases × 3 conditions)"));
  type Row = { k: number; correct: number; conformant: number; total: number; ms: number[]; tok: number; misses: string[] };
  const rows: Row[] = [];

  for (const k of CONDITIONS) {
    const row: Row = { k, correct: 0, conformant: 0, total: 0, ms: [], tok: 0, misses: [] };
    for (let i = 0; i < CASES.length; i++) {
      const c = CASES[i];
      const candidates = candidateSet(c, k, i);
      const { system, user, approxTokens } = buildPrompt(c.prompt, candidates);
      row.tok = approxTokens; // roughly constant per condition; last wins
      const r = await decide({ baseUrl: BASE_URL, model, system, user, enum: candidates, method, timeoutMs: 60_000 });
      row.total++;
      row.ms.push(r.ms);
      if (r.conformant) row.conformant++;
      const correct = r.conformant && r.tool === c.expected;
      if (correct) row.correct++;
      else row.misses.push(`    ${red("✗")} "${c.prompt.slice(0, 42)}…"  want ${b(c.expected)} got ${r.tool ?? "∅"}`);
      process.stdout.write(`\r  k=${k}: ${row.total}/${CASES.length} cases…`);
    }
    process.stdout.write("\r" + " ".repeat(40) + "\r");
    const s = stats(row.ms);
    console.log(
      `  ${b(`k=${String(k).padEnd(2)}`)} ` +
        `correct ${green(pct(row.correct, row.total).padStart(4))} (${row.correct}/${row.total})  ` +
        `conformant ${pct(row.conformant, row.total).padStart(4)}  ` +
        dim(`~${row.tok}tok  lat p50 ${s.p50 | 0}ms p90 ${s.p90 | 0}ms mean ${s.mean | 0}ms`),
    );
    rows.push(row);
  }

  console.log(b("\nMisses") + dim("  (where routing was conformant-but-wrong or failed)"));
  for (const row of rows) {
    if (row.misses.length === 0) continue;
    console.log(dim(`  k=${row.k}:`));
    row.misses.forEach((m) => console.log(m));
  }
  return rows;
}

function verdict(method: ConstraintMethod | null, rows: Awaited<ReturnType<typeof routingEval>> | null) {
  console.log(b("\n──────── VERDICT (fill in NOTES.md) ────────"));
  console.log(`  Bet 1 — constrained decoding works:   ${method ? green("YES via " + method) : red("NO")}`);
  if (!rows) {
    console.log(dim("  Bets 2/3 not run (no working constraint method)."));
    return;
  }
  const acc = rows.map((r) => `k=${r.k} ${pct(r.correct, r.total)}`).join("  ");
  console.log(`  Bet 2 — routing correct (3/8/15):     ${acc}`);
  const degrades = rows[0].correct / rows[0].total - rows[rows.length - 1].correct / rows[rows.length - 1].total;
  console.log(
    dim(
      `         skill-narrowing claim (ADR-0004): correctness ${
        degrades > 0.05 ? "DROPS" : "holds"
      } as tools grow 3→15 (Δ ${(degrades * 100).toFixed(0)}pts)`,
    ),
  );
  const worst = stats(rows[rows.length - 1].ms);
  console.log(
    `  Bet 3 — latency (worst, k=15):        p50 ${worst.p50 | 0}ms  p90 ${worst.p90 | 0}ms  mean ${worst.mean | 0}ms`,
  );
  console.log(
    dim(
      "         3-call pipeline (Route→Decide→Voice) ≈ 3× per-call. If that's intolerable, collapse the pipeline.",
    ),
  );
}

async function main() {
  console.log(b("grugling router validation spike") + dim(`  → ${BASE_URL}`));
  const model = await resolveModel();
  console.log(dim(`  model: ${model}`));
  const method = await probeConstraint(model);
  const rows = method ? await routingEval(model, method) : null;
  verdict(method, rows);
}

main().catch((e) => {
  console.error(red(`\nspike failed: ${e.message}`));
  console.error(dim("is the model server up at " + BASE_URL + " ?"));
  process.exit(1);
});
