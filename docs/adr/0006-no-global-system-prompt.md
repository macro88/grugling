# Prompt assembly: no global system prompt

Grugling has no single, always-injected system prompt. The conventional
SYSTEM.md / CAVEMAN.md files are dropped:

- Output *format* is guaranteed by constrained decoding (ADR-0002), so
  "emit valid JSON" / "return structured tool requests" instructions are
  redundant.
- Brevity and output discipline only matter where the model writes free text
  for a human — the **Voice** call-site.

Persona lives in a single, user-editable `SOUL.md`, injected **only at Voice and
on session hydration**. Every other call-site is assembled from minimal
per-call-site fragments (Route's classification instruction, Decide's
"pick a tool" instruction, and the selected skill's own instructions) via the
fixed-slot template.

We record this because it deviates from the obvious path: a contributor will be
tempted to add a global system prompt. That would re-bloat every call against
the context budget and duplicate what the grammar already enforces — it is the
wrong instinct here.
