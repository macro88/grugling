# Skills and progressive disclosure

Capabilities are packaged as **skills** — instructions, a narrowed set of allowed
tools, and optional scripts — following the model proven by Claude Code and
Codex. Only skill names and one-line descriptions stay in context; a skill's
full detail and its tools load only when it is selected. The same
progressive-disclosure pattern is applied to Memory recall (a small always-loadable
index, with detail fetched on demand).

Given a tiny, host-variable context budget, this is what lets the tool ecosystem
grow large while any single model call stays small.

## Consequences

- It also *improves reliability*: a selected skill narrows the in-scope tools, so
  the constrained-decoding grammar for the next decision is small. Fewer choices
  → tighter grammar → a small model that is actually accurate.
- We build the skill loader + index in the MVP rather than shipping a flat,
  hardcoded tool list, because progressive disclosure is what makes the system
  both scalable and reliable under the context constraint — it is not a later
  optimisation.
