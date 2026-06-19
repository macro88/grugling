# grugling

A brutally simple personal assistant that treats a *small* local model as a
**router/planner**, not the worker. See [CONTEXT.md](CONTEXT.md) for vocabulary,
[ARCHITECTURE.md](ARCHITECTURE.md) for the design,
[docs/design/code-design.md](docs/design/code-design.md) for the code-level
design (structure, pipeline, lifecycles), and
[docs/prd/core-router-mvp.md](docs/prd/core-router-mvp.md) for the MVP scope.

## Status

Slice 1 — the walking skeleton: a GBNF-constrained Provider reachable
end-to-end from the CLI. One constrained model call (Route) per invocation.

## Requirements

- Node **24+** (runs `.ts` directly — no build step)
- pnpm
- A local OpenAI-compatible model server (e.g. llama.cpp) reachable at the
  configured base URL.

## Run

```sh
pnpm install
pnpm grugling "hello there"        # → {"route":"chat"}
pnpm grugling "summarise https://example.com"   # → {"route":"task"}
```

One structured `model_call` event per call is written to stderr (JSONL); the
decision goes to stdout.

## Configure

Copy `config.example.yaml` to `config.yaml` and edit, or override per-field with
env vars (`GRUGLING_BASE_URL`, `GRUGLING_MODEL`, `GRUGLING_MAX_TOKENS`,
`GRUGLING_CONTEXT_BUDGET`, `GRUGLING_PROFILE`, `GRUGLING_CONFIG`). Precedence:
built-in defaults < selected profile in file < env.

## Develop

```sh
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
```
