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
