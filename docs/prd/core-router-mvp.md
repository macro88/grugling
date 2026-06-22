# Core Router MVP — PRD

> **Status:** partially built on `main` · **Tracking issue:** [macro88/grugling#1](https://github.com/macro88/grugling/issues/1)
> **Scope:** target build-order steps 1–4 in [ARCHITECTURE.md](../../ARCHITECTURE.md) — the command-line increment that proves the core thesis.
> **Vocabulary:** [CONTEXT.md](../../CONTEXT.md). **Rationale:** [ADRs](../adr/) 0001–0009.
>
> This doc is the canonical PRD. The tracking issue is an index into it; an implementing agent should read this doc plus that issue.
> The current implementation has steps 1–3 only: Provider + constrained decoding, fixed-slot Route/Voice, deterministic compression, the tool registry, and one trusted `now` tool running through the bounded Decide loop. Skill loading / progressive disclosure and the `summarise-link` / `system-health` skills remain unbuilt.

## Problem Statement

As a developer, I have spare/old laptops and can run a small local LLM, but a small model on its own is not a usable assistant: it emits malformed tool calls, rambles, picks the wrong action, and can't be trusted to drive real work. I want to know whether a small *local* model can become genuinely useful — privately, on modest hardware — if the software around it is disciplined enough to compensate for its weaknesses.

## Solution

A brutally simple command-line agent — the **Harness** — that treats the small model as a **Router/planner, not the Worker**. The developer issues a request from the CLI; the Harness classifies it (**Route**) as chat or task. Chat goes straight to a terse persona reply (**Voice**). A task enters a bounded **Decision loop**: at each step the model makes one **constrained-decoding** choice — pick a **Tool** (from the selected **Skill**'s narrowed set) or finish — and the Harness executes it deterministically, compresses the result, and loops (capped). The loop produces *facts*; **Voice** turns them into the reply. New capabilities are added by dropping in a **Skill**, never by editing the Harness. Everything runs against the developer's local OpenAI-compatible model.

The target MVP adds two Skills: **summarise-link** (fetch a URL → distil to a short summary, demonstrating the **trust boundary**) and **system-health** (read-only local commands → a short health summary).

## User Stories

1. As a developer, I want to run a one-shot request from the CLI against my local model, so that I get useful results without any cloud service.
2. As a developer, I want grugling to distinguish chat from a real task (Route), so that "hello" doesn't spin up tool machinery.
3. As a developer, I want a plain conversational answer for chat-type messages, so that trivial exchanges feel natural.
4. As a developer, I want a task to trigger a bounded Decision loop, so that the agent can chain a few tool steps without running away.
5. As a developer, I want the model's tool choices to be schema-constrained, so that I never get a malformed or out-of-vocabulary tool call.
6. As a developer, I want the loop capped at a configurable number of iterations, so that a confused model can't loop forever or burn the machine.
7. As a developer, I want each Tool's raw output compressed before it re-enters context, so that a noisy command can't blow the tiny context budget.
8. As a developer, I want full raw tool output preserved outside the model context, so that nothing is lost even though the model only sees a compact summary.
9. As a developer, I want grugling to pick the right Skill for my request from a small index, so that only the relevant tools are in scope.
10. As a developer, I want only the selected Skill's tools in scope during a task, so that the model is more accurate (smaller decision space) and safer.
11. As a developer, I want to summarise a web link by giving its URL, so that I can capture the gist of an article quickly.
12. As a developer, I want a one-line health summary of my machine (disk, memory, top processes), so that I can check on a spare box at a glance.
13. As a developer, I want grugling to reply tersely and without filler (the caveman/grug Voice), so that answers are fast to read.
14. As a developer, I want grugling to ask at most one question, and only when genuinely blocked, so that it doesn't nag.
15. As a developer, I want untrusted fetched content to be unable to trigger any action, so that a poisoned web page can't make grugling do something I didn't ask for.
16. As a developer, I want fetched/scraped content distilled by a step that has no tools, so that injected instructions can at most become words in a summary, never an executed action.
17. As a developer, I want to point grugling at my model via simple config (base URL, model name, profile), so that I can run it against llama.cpp or LM Studio without code changes.
18. As a developer, I want context-budget and token limits sized by a config profile, so that grugling fits whatever model and hardware I'm running.
19. As a developer, I want each model call and tool call logged as a structured event, so that I can see where the small model succeeds and fails.
20. As a developer, I want the constraint-conformance rate reported, so that I can judge whether the small model is a reliable router on my hardware.
21. As a developer, I want call latency recorded, so that I know whether the multi-call pipeline is fast enough to use.
22. As a developer, I want a clear, logged fallback when the model's output can't be constrained, so that failures are visible rather than silently turned into chat.
23. As a developer, I want secrets (keys, tokens, env vars) kept out of the model's context and logs, so that running with broad access doesn't leak credentials.
24. As a developer, I want grugling to run with whatever access its environment grants (full laptop, or sandboxed in a container), so that it's genuinely useful and I pick the blast radius at deploy time.
25. As a contributor, I want to add a new Tool as a self-describing module in the registry, so that it becomes selectable without touching the Harness.
26. As a contributor, I want a Tool's input schema to automatically constrain the model's decision, so that adding a tool needs no separate grammar work.
27. As a contributor, I want to add a new Skill as a folder (instructions + allowed tools), so that capabilities grow by drop-in, not by editing core code.
28. As a contributor, I want the Provider to expose "return output matching this schema", so that the rest of the Harness never depends on a specific backend's quirks.
29. As a contributor, I want deterministic compression behind an interface, so that a smarter backend (e.g. RTK) can replace it later without touching the loop.
30. As a developer, I want the whole core to run from a single command, so that I can try it immediately after cloning.
31. As a developer, I want a clear error if the model server is down or slow, so that I get feedback rather than a hang.
32. As a developer, I want the persona defined in one editable file (SOUL), so that I can tune grugling's voice without digging through code.

## Implementation Decisions

- **Provider port** with an **OpenAI-compatible HTTP adapter**. Core method: "return a decision/text conforming to this schema." Implements **constrained decoding via GBNF** (llama.cpp top-level `grammar`). The router spike found `response_format.json_schema`, llama.cpp `json_schema`, and `json_object` all return **empty** on the target build, so JSON-schema is **not** a usable constraint path; the adapter needs a **schema→GBNF compiler** to turn in-scope tool input schemas into grammars. Fallback ladder: constrain → parse-and-repair → treat-as-answer (the last logged as a failure, never silent). The free-text **Voice** reply is the deliberate exception — a separate `generate` path with no grammar (ADR-0003). **Model-side reasoning is disabled by default** so a "thinking" model cannot consume the output budget before emitting the reply or the constrained token (ADR-0009). Re-probe LM Studio before assuming parity. Per ADR-0002. (Shape seeded by the spike's `provider.ts`.)
- **Harness core**: the per-message pipeline **Route → Decide (bounded loop) → Voice** (ADR-0003) with **fixed-slot prompt assembly** — each call freshly built from bounded slots, no growing transcript. Decide emits *facts*; Voice emits the user-facing reply.
- **Tool registry + Tool contract**: every Tool exposes name, description, input schema, `execute → result envelope`, and declarative metadata (`trust`, `risk`; forward-compatible `needsConfirmation` / `longRunning` declared but not implemented). The in-scope tools' input schemas generate the constrained-decoding grammar (ADR-0001, 0002).
- **Result envelope**: uniform across tools — `{ ok, raw, trust }`. The bounded Decide loop preserves the full raw output out of context, compresses it into the model-facing fact summary, and records the raw pointer on that fact.
- **Skill loader + progressive disclosure** (ADR-0004): target step 4. Only Skill names + one-line descriptions will sit in context; selecting a Skill will load its instructions and narrow the in-scope tools (smaller grammar → higher reliability). A "general" default Skill will cover chat / unscoped requests.
- **Compression** behind an interface; the MVP adapter is deterministic (head/tail, error-grep, char cap). RTK is a future backend, not wired here.
- **Persona**: a single editable `SOUL.md` injected only at Voice; other call-sites use minimal per-call-site fragments; **no global system prompt** (ADR-0006).
- **Config loader**: a profile-based file (base URL, model, context budget, per-call-site token budgets, Voice temperature, model-side reasoning toggle, loop cap), hand-edited for MVP. Token budgets and temperature are sized to the host, never hardcoded.
- **Logging hook**: emits structured events (call-site, tokens, latency, schema, conformance/fallback, tool name + trust). Headline metric: **conformance rate**.
- **Trust boundary (ADR-0005)**: current code fails closed on untrusted tool output off the result's `trust` tag. The target step-4 shape feeds untrusted content only to a **tool-less** summarise/extract call-site, so Decide only ever ingests distilled facts, never raw untrusted content.
- **Secrets (ADR-0008)**: tools wield secrets by handle; redaction keeps them out of model context and logs (in this CLI scope, primarily the use-don't-see principle + log redaction).
- **Security posture (ADR-0007)**: autonomy by default; the environment is the capability boundary; confirmation is an optional policy, off in MVP.
- **Decision contract**: a small closed set of decision types — at minimum `route` (chat | task), `decide` (call a tool with args | finish), `voice` (free text) — each its own schema at its own call-site.
- **Stack**: TypeScript; a standalone CLI entry point (the same core is later hosted by a daemon — out of scope here).

## Tech Stack

- **Language / runtime:** TypeScript on **Node 24**, running `.ts` directly (native TS) — no build step for dev; `tsc --noEmit` for typecheck.
- **Package manager:** pnpm.
- **Layout:** a single pnpm package; modules under `src/` (`provider/`, `harness/`, `tools/`, `config/`, `logging/`); no workspace yet. `skills/` is planned but not landed.
- **Tests:** Vitest.
- **CLI:** no arg-parsing framework — hand-rolled `process.argv`; revisit only if the command surface grows.
- **Constrained decoding:** GBNF grammars via llama.cpp `grammar`, plus a schema→GBNF compiler (see Implementation Decisions and ADR-0002).
- **Provider interface:** two verbs — `decide({ system?, user, grammar, maxTokens?, timeoutMs? }) → { ok, conformant, value, raw, ms }` for constrained decisions, and `generate({ system?, user, temperature?, maxTokens?, timeoutMs? }) → { ok, text, ms }` for the free-text Voice reply. `baseUrl`/`model`/`reasoning` bind when the adapter is constructed (not per call). Seeded by the spike's `provider.ts`.
- **Tool registry shape:** `{ name, description, inputSchema, execute(args) → ResultEnvelope, meta: { trust, risk, … } }`; the in-scope tools' `inputSchema`s feed the schema→GBNF compiler.

These are PRD constraints, not ADRs (reversible, conventional). The one ADR-level choice — GBNF over JSON-schema — lives in ADR-0002.

## Testing Decisions

- **What makes a good test**: asserts *external behaviour* — which Tools are dispatched and with what args, the final reply/result, that the trust boundary holds, that the loop cap is honoured, and that an unconstrainable response triggers the logged fallback. Never asserts internal call ordering or private structure.
- **Primary seam — the Provider port**: tests inject a **scripted fake Provider** returning canned, schema-conforming decisions, making the whole Harness deterministic. A scripted sequence of decisions + tool results drives the pipeline; assertions are on outputs and effects.
- **Supporting substitutions (existing ports, not new seams)**: **fake Tools registered in the registry** (assert dispatch + args; inject canned results with no real side effects); **captured output** for the final Voice text/result.
- **Trust-boundary test**: register a fetch-style fake tool returning poisoned content plus an outward fake tool, then assert the outward tool is **never** dispatched as a result of the injected content. Current code blocks before a later Decide; the tool-less summarise call-site is future work.
- **Modules tested**: the Route→Decide→Voice pipeline, the bounded Decision loop (cap + fallback ladder), the Tool registry/contract, compression, and trust-boundary enforcement. Skill selection + tool-narrowing land with step 4.
- **Real-model coverage**: one thin, optional end-to-end smoke test against a live local model, plus the separate throwaway **spike** that measures conformance, routing accuracy, and latency. Routine tests do **not** hit the real model.
- **Prior art**: none — greenfield. This PRD establishes the seam pattern (scripted Provider + registry fakes) for all later harness work.

## Out of Scope

Everything in [ARCHITECTURE.md](../../ARCHITECTURE.md) build-order steps 5–9 and the deferred list: the **daemon** and CLI-as-thin-client split (the CLI is standalone here), **Sessions** / TTL and conversation persistence, **Compaction**, **Telegram** / any messaging adapter, the **Scheduler** and unattended jobs, **persistent Memory** (`recall` / `core`), writing to an Obsidian **Vault**, calendar / email / web-build / cloud-offload Skills, vector or SQL memory, embeddings / RAG, the history→memory fact-extraction job, RTK integration, the assisted-setup / model-picker installer, process supervision / auto-recovery, and the optional confirmation policy. The validation **spike** is separate throwaway code, not part of this build.

## Further Notes

- **Build riskiest-first** ([ARCHITECTURE.md](../../ARCHITECTURE.md)): land the Provider + constrained decoding and prove a schema-conforming decision comes out of the local model *before* building the pipeline outward. **Spike verdict (2026-06-18): all three bets cleared** — constrained decoding works via GBNF (JSON-schema returns empty on this build), routing 100/93/93% correct at 3/8/15 tools, ~0.8–1.3s per call (3-call pipeline ≈ 2.4–4s). Build proceeds.
- **Constrained decoding is the lynchpin** (ADR-0002), and on the target llama.cpp build that means **GBNF specifically** (JSON-schema returns empty). If a backend cannot constrain, the reliability claim weakens — surface conformance rate prominently.
- **Reasoning models eat the budget** (verified 2026-06-20, ADR-0009): on `gemma-4-E4B` a chat reply came back **empty** because the model spent the whole output budget on a hidden chain-of-thought before the content; the same call ran ~10s vs ~1s with thinking off. Model-side reasoning is **disabled by default**; the disable knob is build-dependent (re-probe), and a truncated/empty completion is now surfaced as a failure rather than a silent blank.
- **Skill-narrowing is only weakly validated so far** (ADR-0004): the spike saw a 7-point accuracy gain on a single case. Treat the *speed* gain as solid, but re-run a larger/harder routing eval before relying on the accuracy gain (covered by the conformance-report + eval slice).
- Reference hardware: AMD Ryzen 5 4600U / ~14 GB RAM, model `gemma-4-E4B` (Q4_K_M) at a 4096-token context. Context is small and host-variable — respect the budget in every slot.
- Success is judged by real use + logs (conformance rate, loop length, latency), not a formal eval set.
