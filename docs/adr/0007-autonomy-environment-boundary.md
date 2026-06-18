# Security posture: autonomy by default, the environment is the boundary

Grugling runs with full access to whatever environment hosts it: on a laptop,
the whole laptop; in a container, only the container. Isolation is a
*deployment* choice (run it in Docker or a VM), not an in-app restriction. We
reject the allowlist-only tools and mandatory destructive-action confirmation
that the early notes assumed, because an agent crippled by allowlists and
constant confirmation prompts isn't useful enough to be worth running —
**autonomy is the product**.

Safety comes from boundaries that don't sacrifice autonomy:

- **Capability boundary** — the host/container, chosen by the operator at deploy
  time.
- **Injection containment** — the trust boundary (ADR-0005): untrusted content
  is distilled by a tool-less call-site before any deciding step can act on it.
- **Secrets boundary** — the model never sees raw secrets (ADR-0008).
- **Confirmation** — available as an optional, user-configurable policy, not a
  hard gate; off by default.

## Consequences

- A general shell capability is permitted. Skills/tools remain valuable for
  *reliability* (a small model picks a named tool more reliably than it authors
  a correct shell command), not for containment.
- The documented contract: with full access, a model mistake or a
  trust-boundary gap can affect everything the process can reach. Operators who
  want a smaller blast radius run grugling in a container or VM.
- Scheduled (unattended) jobs run with the same access as interactive ones; the
  trust boundary — not a capability allowlist — is what protects unattended runs
  that touch untrusted content.
