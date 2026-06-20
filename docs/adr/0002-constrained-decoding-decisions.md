# Constrained decoding for model decisions

The harness never trusts the small model to format a decision freehand. Every
decision call-site constrains the model's output to a schema/grammar (e.g.
llama.cpp GBNF, LM Studio JSON-schema), so the model *cannot* emit malformed or
out-of-vocabulary choices. The set of in-scope tools' input schemas is what
generates the grammar.

This is the backbone of turning a tiny model into a reliable router.

## Update (2026-06-18): GBNF only on the target llama.cpp build

A router spike (`unsloth/gemma-4-E4B-it` on llama.cpp) found that
`response_format.json_schema`, llama.cpp's top-level `json_schema`, and
`json_object` all return **empty content** on this build — only a **GBNF
`grammar`** produced conformant output. So the constraint mechanism is **GBNF**,
not JSON-schema, and the Provider adapter needs a **schema→GBNF compiler** to
turn in-scope tool input schemas into grammars. Re-probe LM Studio before
assuming it behaves the same. Routing was reliable (100/93/93% correct at 3/8/15
tools) and fast enough (~0.8–1.3s/call), so the decision stands — only the
mechanism is pinned to GBNF.

## Update (2026-06-20): the free-text exception, and reasoning vs the budget

Two clarifications from building the Route → Voice path:

- **Voice is the deliberate exception.** This ADR governs *decision* call-sites.
  The **Voice** call-site produces free-text prose for a human and is
  intentionally *unconstrained* (no grammar) — it uses the Provider's `generate`
  verb, not `decide`. That is *why* it is also the only place the persona is
  injected (ADR-0003, ADR-0006). Constrained decoding still governs every
  decision; free text is the single, bounded exception.
- **Reasoning can defeat the constraint budget.** On a "thinking" model the
  hidden chain-of-thought is emitted before the constrained token and counts
  against `max_tokens` — so a small decision budget can be spent entirely on
  reasoning, yielding empty (hence non-conformant) output. Model-side reasoning
  is therefore off by default (ADR-0009).

## Considered options

- **Native function-calling** (`tools` param) — rejected: unreliable on small
  models and inconsistently supported across llama.cpp / LM Studio. It bets the
  experiment on the model's weakest skill.
- **Parse the model's free JSON, fall back to treating it as an answer** —
  rejected: silently turns a failed tool call into a chat reply, hiding failures
  rather than recovering from them.

## Consequences

The Provider port leans on runtime-specific constraint features under the hood,
even though its transport is the generic OpenAI-compatible API. When a backend
cannot constrain output, the fallback ladder is parse-and-repair, then
treat-as-answer — and the latter is logged as a failure, never silent.
