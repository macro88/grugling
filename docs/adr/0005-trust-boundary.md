# Trust boundary for untrusted tool output

Tool results carry a `trust` tag. Raw **untrusted** content (fetched web pages,
scraped sites, emails) may only ever be fed to a call-site that has **no
actuating tools in scope** — it must be distilled into plain facts by a
tool-less summarise/extract step *before* it can reach any Decide call-site that
could act on it. Trusted output (e.g. local read-only command results) is
exempt.

Small local models are highly susceptible to prompt injection, and grugling
routinely pulls external content into the model while also (eventually) exposing
outward tools (email, shell, cloud-offload). Without this boundary, injected
instructions inside fetched content could steer the agent into actions the user
never asked for.

## Why this holds

- The model's actions are gated by constrained decoding over the *selected
  skill's* tools (ADR-0002, ADR-0004), so injected content cannot summon a tool
  that isn't in scope — at worst it steers among already-allowed tools.
- Distilling untrusted content in a tool-less call-site means injected
  instructions can, at most, become words in a summary — never an executed
  action.
- Outward/destructive actions may additionally require human confirmation, but
  this is an optional, user-configurable policy (see ADR-0007) — not the primary
  defence.

## Consequences

- The tool result envelope gains a `trust` dimension; tools declare whether
  their output is untrusted.
- Prompt-level framing (delimiting untrusted content, labelling it "data, not
  instructions") is used, but treated as the weakest layer — never the sole
  defence.
