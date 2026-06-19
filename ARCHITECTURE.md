# Grugling — Architecture Overview

This is the hub that ties the design together. For precise vocabulary see
[CONTEXT.md](CONTEXT.md); for the *why* behind each decision see the ADRs in
[docs/adr/](docs/adr/); for the code-level design — module structure, the call
pipeline and extension points, and the lifecycles — see
[docs/design/code-design.md](docs/design/code-design.md). This document gives the
whole-system picture and the MVP scope.

Grugling is a brutally simple personal assistant for modest, spare hardware. The
bet: a *small* local model can be a reliable **router/planner** if the
deterministic machinery around it is excellent. The model never does the heavy
lifting — it resolves small, schema-constrained decisions; the tools and harness
do the work.

## Runtime shape

- A persistent **daemon** hosts the messaging listener, an internal
  scheduler/ticker (session sweeps + user jobs), and the harness.
- A thin **CLI** is a client onto the same core for dev and ad-hoc use.
- All state lives on disk, so restarts resume cleanly. (Process supervision /
  auto-recovery is post-MVP and must be external to the daemon.)

## The per-message pipeline (ADR-0003)

Two regimes meet in one flow. The stateful **conversation** (persona, history)
wraps the stateless **decision loop** (tools, no history).

```
inbound message
  └─ Route  (chat or task?)                         ── cheap, schema-constrained
       ├─ chat ───────────────────────────► Voice ─► reply
       └─ task ─► Decision loop ───────────► Voice ─► reply
                    Decide → Tool → compress → (repeat, capped)
```

- **Decide produces facts; Voice produces the reply.** The loop never talks to
  the user; the persona never formats a tool call.
- **Voice** is the only place with personality, and the only emitter of
  user-facing output — including proactive notifications.
- The model is invoked at distinct **call-sites** (Route, Decide, Voice, plus
  summarise/compact), each a freshly assembled prompt + a schema its output must
  satisfy (ADR-0002). There is no growing chat transcript fed to the model.

## Extensibility (ADR-0001, ADR-0004)

- **Tools** — uniform-contract primitives (name, description, input schema →
  grammar, `execute` → result envelope, metadata: `trust`/`risk`/
  `needsConfirmation`/`longRunning`). Adding one never touches the harness.
- **Skills** — bundles of instructions + a *narrowed* tool set + optional
  scripts. **Progressive disclosure**: only names + one-line descriptions sit in
  context; detail loads on selection. This is what keeps the context tiny *and*
  makes the model reliable (fewer in-scope tools → tighter grammar).
- **Hooks** — lifecycle extension points (`postToolUse`, `contextPressure`,
  `sessionPurged`, `taskComplete`, redaction, logging). Cross-cutting behaviour
  attaches here without modifying the core.

## Ports (swappable adapters)

The harness is a small stable core orchestrating ports; correctness never
depends on an optional adapter (there's always a dumb fallback).

| Port | MVP adapter | Later |
|---|---|---|
| **Provider** | OpenAI-compatible HTTP + constrained decoding | other backends |
| **Memory** | grep over markdown files + index | SQL / vectors / semantic |
| **Compression** (tool output) | deterministic (head/tail/grep) | RTK, model-based |
| **Compaction** (conversation) | model-summarise; truncate fallback | smarter strategies |
| **Messaging** | Telegram (inbound + proactive) | other channels |

## State & persistence

- **Session** — a TTL'd conversation thread, one JSON file per session named by
  `<channel>-<startedAt>`, `status`-driven (active/purged). The internal ticker
  expires sessions (summarise → `sessionPurged` hook → notify → evict) and
  prunes purged sessions past a retention window (~30d default). Purge ≠ delete;
  "continue the previous discussion" rehydrates from the resume-summary.
- **Conversation history** — verbatim record (immutable) vs the derived
  active-context view (`running summary + recent tail`). Compaction never
  mutates the record.
- **Memory** — durable agent facts, two-tier: a small always-loadable `core()`
  (injected on hydration / on demand, not every turn) + on-demand
  `recall(query)`. Writes are deliberate in MVP.

## Security model (ADR-0005, 0007, 0008)

1. **Capability boundary = the environment.** Autonomy by default; isolate by
   running in Docker/a VM. No allowlist-only crippling.
2. **Trust boundary.** Untrusted content (fetched pages, emails) is distilled by
   a **tool-less** call-site before any deciding step can act on it.
3. **Secrets boundary.** The model never sees raw secrets; tools wield them by
   handle; a redaction hook scrubs context *and* logs.
4. **Confirmation** is an optional, configurable policy — not a hard gate.

## Instrumentation

Structured-event JSONL via a logging hook. Headline metric: **constraint
conformance rate** (did the model's output match the grammar first try?). Also
loop length, latency, tokens, compression ratio, failures. Success signal:
implicit (rephrase/retry) + lightweight explicit 👍/👎.

## MVP scope

**In:** TypeScript daemon + CLI; Provider adapter with constrained decoding;
Route/Decide/Voice + fixed-slot assembly; tool registry + result envelope; skill
loader + progressive disclosure with 1–2 skills (link→summary hero,
system-health); core hooks (compression, contextPressure, taskComplete,
sessionPurged, redaction, logging); memory grep/markdown adapter; sessions +
internal ticker; Telegram adapter; user-created scheduled jobs; `SOUL.md` +
per-call-site fragments; hand-edited `config.yaml` with profile presets.

**Out (deferred):** Obsidian vault skill; calendar/email/web-build skills;
long-running/async + cloud-offload delegation; vector/SQL memory; embeddings/RAG;
history→memory fact-extraction cronjob; assisted-setup probe / model-picker
installer; process supervision; pre-authorised outward scheduled jobs.

## Build order

Riskiest-thing-first — prove the small model can be a reliable router *before*
building outward.

1. **Provider adapter + constrained decoding** — prove a reliable structured
   decision comes out of the local model.
2. **Fixed-slot assembly + Route + Voice** — a chat round-trip with persona.
3. **Tool registry + result envelope + one read-only tool + Decide loop** — a
   task end-to-end (e.g. system-health).
4. **Skill loader + progressive disclosure + the link→summary hero skill** — the
   trust boundary in action (fetch → tool-less summarise).
5. **Memory port + grep/markdown adapter** — `core`/`recall` injection.
6. **Daemon + sessions + conversation store + internal ticker** — TTL purge,
   notify, compaction.
7. **Messaging port + Telegram adapter** — inbound + proactive.
8. **Scheduler** — user-created jobs.
9. **Hooks wired end-to-end** — compression/RTK, redaction, logging,
   instrumentation.
