# Spike verdict

**Question:** can the small local model be a reliable, fast-enough router with
schema-constrained output? (build-order step 1, ARCHITECTURE.md)

Run `node prototypes/router-spike/spike.ts` and record what it taught you.

First run: 2026-06-18, `unsloth/gemma-4-E4B-it-GGUF:Q4_K_M` on llama.cpp @ :8080, n_ctx 4096.

## Bet 1 — constrained decoding works  →  YES, but only via GBNF
- Working method: **`grammar` (GBNF)**.
- **The OpenAI-style paths FAILED on this build**: `openai_json_schema`,
  llama.cpp top-level `json_schema`, and `json_object` all returned **empty
  content** (HTTP 200, no error). Only a hand-written GBNF grammar produced
  conformant output.
- **Architectural impact (ADR-0002):** the Provider adapter must drive llama.cpp
  via GBNF, not `response_format.json_schema`. This vindicates the ADR's "verify
  for their version; do not assume" — the assumption would have been wrong.
  Implies the Provider needs a **schema→GBNF compiler** (currently only the fixed
  `{tool: enum}` shape is hand-built). Re-probe before assuming LM Studio behaves
  the same.

## Bet 2 — routing correctness (3 / 8 / 15 tools)  →  strong
- Accuracy: **100% / 93% / 93%** (correct, not just conformant). Conformance 100%
  across the board — constrained decoding never emitted an invalid choice.
- Skill-narrowing claim (ADR-0004): **weakly supported** (Δ 7pts, a single case).
  Real signal but one example — not yet a proven curve. Worth re-running with a
  larger/harder case set before leaning on it hard.
- Only confusion: *"Send me a notification when the backup finishes"* routed to
  `set_reminder` instead of `send_message` at k≥8 — genuinely ambiguous phrasing
  ("when X finishes" reads as scheduling), not a model failure. Sharpen tool
  descriptions or the prompt to disambiguate.

## Bet 3 — latency  →  tolerable
- Per-call: k=3 ~800ms · k=8 ~970ms · k=15 p50 1268 / p90 1355 / mean 1276ms.
- Scales with prompt size (more tools → bigger prompt → slower) — reinforces the
  context-economy + skill-narrowing strategy for speed, not just accuracy.
- 3-call pipeline (Route→Decide→Voice) ≈ **2.4–4s** end-to-end. Tolerable for a
  chat assistant; **no need to collapse the pipeline.** Keep tool sets small to
  stay near the fast end.

## Decision
All three bets clear. Proceed to build the harness (build-order step 1) — but:
1. Provider adapter targets **GBNF**, with a schema→GBNF step; OpenAI json_schema
   is NOT a usable constraint path on this llama.cpp build.
2. Keep `provider.ts` as the seed; fold it into the real Provider adapter.
3. Re-run this eval with more/harder cases before treating the skill-narrowing
   accuracy gain (vs the speed gain, which is solid) as established.

Then delete `spike.ts` / `cases.ts` / `README.md`, keep `provider.ts`.
