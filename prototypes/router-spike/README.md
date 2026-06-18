# Router validation spike — THROWAWAY

Front-loads build-order step 1 from [ARCHITECTURE.md](../../ARCHITECTURE.md):
**prove the small local model can be a reliable router before building the harness.**

## The question

Three empirical bets the design rests on:

1. **Constrained decoding works** on this runtime via the OpenAI-compatible API
   (ADR-0002). The spike probes four methods and reports which the server honours:
   `openai_json_schema`, llama.cpp `json_schema`, GBNF `grammar`, `json_object`.
2. **Routing is correct, not just conformant** — and does correctness survive as
   the candidate tool set grows 3 → 8 → 15? That last bit tests the ADR-0004
   skill-narrowing claim (fewer in-scope tools → more accurate).
3. **Per-call latency** at realistic prompt sizes is tolerable on this CPU. The
   real pipeline is 3 calls (Route → Decide → Voice), so multiply accordingly.

## Run

Node 24 runs TypeScript directly — no build, no deps, no `package.json`:

```sh
node prototypes/router-spike/spike.ts
```

Point it elsewhere if needed:

```sh
BASE_URL=http://localhost:1234/v1 MODEL=some-model node prototypes/router-spike/spike.ts
```

~49 calls (4 probe + 45 eval). On CPU expect a couple of minutes; progress prints live.

## Files

- `provider.ts` — **the keeper.** Minimal constrained-decode Provider call. Lift
  this into the real Provider adapter when the bets check out.
- `cases.ts` — 15 hand-labelled prompts + the 15-tool catalog (the curated value).
- `spike.ts` — throwaway runner: probe → eval → verdict. Delete after.

## When done

Record the verdict in `NOTES.md`, fold `provider.ts` into the real code, delete the rest.
