# grugling

A brutally simple personal assistant that treats a *small* local model as a
**router/planner**, not the worker. See [CONTEXT.md](CONTEXT.md) for vocabulary,
[ARCHITECTURE.md](ARCHITECTURE.md) for the design,
[docs/design/code-design.md](docs/design/code-design.md) for the code-level
design (structure, pipeline, lifecycles), and
[docs/prd/core-router-mvp.md](docs/prd/core-router-mvp.md) for the MVP scope.

## Status

Slice 3 — the bounded task path is live: a message is **Routed** (chat | task,
GBNF-constrained). Chat flows straight to **Voice**; tasks run through
**Decide → tool → compression → Voice** with one trusted read-only tool
(`now`). Skills, untrusted-content distillation, and persistence are still
designed only.

## Requirements

- Node **24+** (runs `.ts` directly — no build step)
- pnpm
- A local OpenAI-compatible model server (e.g. llama.cpp) reachable at the
  configured base URL.

## Run

```sh
pnpm install
pnpm grugling "hello there"        # → a terse grug reply (chat → Voice)
pnpm grugling "what time is it?"   # → task path via Decide → now tool → Voice
```

The reply goes to stdout; one structured `model_call` event per model call is
written to stderr (JSONL). The persona lives in the editable `SOUL.md`, injected
only at Voice.

## Configure

Copy `config.example.yaml` to `config.yaml` and edit, or override per-field with
env vars (`GRUGLING_BASE_URL`, `GRUGLING_MODEL`, `GRUGLING_DECISION_MAX_TOKENS`,
`GRUGLING_VOICE_MAX_TOKENS`, `GRUGLING_VOICE_TEMPERATURE`, `GRUGLING_REASONING`,
`GRUGLING_CONTEXT_BUDGET`, `GRUGLING_LOOP_CAP`, `GRUGLING_PROFILE`,
`GRUGLING_CONFIG`). Precedence: built-in defaults < selected profile in file <
env.

Token budgets and Voice temperature are sized to your host, not hardcoded.
Model-side reasoning ("thinking") is **off by default** — on a small model it
burns the output budget and latency for work the harness does deterministically
(ADR-0009); set `reasoning: true` to re-enable per profile.

## Develop

```sh
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
```
