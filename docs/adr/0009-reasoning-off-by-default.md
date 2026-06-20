# Model-side reasoning off by default

Grugling treats the small local model as a **router/planner, never the worker**
(ADR-0003): the harness owns planning, the model only resolves small,
constrained decisions. Many local models are "reasoning"/"thinking" models that
emit a hidden chain-of-thought *before* the answer.

We **disable model-side reasoning by default**. A profile flag `reasoning`
(default `false`) controls it; the Provider adapter asks the server to turn
thinking off. A deployment that genuinely wants it can set `reasoning: true`.

We record this because, on grugling's target (a small model, a tiny
host-variable context budget), model reasoning is actively harmful:

- **It eats the output budget.** Reasoning tokens count against `max_tokens`. On
  the reference model (`gemma-4-E4B`) a "hello" produced ~283 completion tokens of
  thinking before the 6-character reply — so a modest Voice budget was consumed
  entirely by the chain-of-thought and the reply came back **empty**. The same
  failure threatens grammar-constrained decisions on a small budget.
- **It is slow.** That single call ran ~10 s versus ~1 s with reasoning off — the
  multi-call pipeline (ADR-0003) cannot afford it on local inference.
- **It is redundant.** The reliability comes from constrained decoding (ADR-0002)
  and the deterministic harness loop — not from the model thinking out loud. The
  "thinking" is exactly what we moved into deterministic code.

This is the same instinct as ADR-0006 (no global system prompt): resist
re-empowering the model against the context budget when the architecture already
provides the capability deterministically.

## Consequences

- The Provider adapter carries a build-dependent disable knob (e.g. llama.cpp
  `chat_template_kwargs: { enable_thinking: false }`, the server flag
  `--reasoning-budget 0`, or `reasoning_effort: "none"`). **Re-probe per backend**
  before assuming a knob is honoured — like the GBNF finding (ADR-0002).
- Because the knob is not universal, two backstops keep failures non-silent even
  when reasoning slips through: budgets are sized generously per profile, and a
  truncated/empty completion (`finish_reason: "length"`) is reported as a failure
  (`ok: false`), never a silent partial.
- The structured log records `finishReason` and prompt/completion token counts so
  a reasoning-overrun is diagnosable at a glance.
- A future refinement is captured but **not built**: decide *per request* whether
  a prompt is complex enough to warrant reasoning (model-judged or by a
  deterministic heuristic), rather than a single global flag.
