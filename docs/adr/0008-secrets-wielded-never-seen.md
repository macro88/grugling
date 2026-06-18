# Secrets are wielded, never seen

The model never sees raw secrets — API keys, tokens, passwords, environment
variables — even though grugling otherwise has full environment access
(ADR-0007). Two mechanisms enforce this:

- **Use, don't see.** Secrets are resolved and wielded by deterministic tools at
  the point of use (a tool that calls an API holds the key internally). The
  model refers to a secret by name/handle; the harness substitutes the real
  value only when executing the tool.
- **Redaction hook.** A single hook scrubs known secret patterns from anything
  entering model context (tool output, environment dumps) *and* from logs, so a
  secret that leaks into output never reaches the model or the instrumentation.

Broad capability to *act* does not require the model to *see* credentials. This
also closes an exfiltration path: untrusted content (ADR-0005) cannot trick the
model into leaking a secret the model never had.

## Consequences

- Tools that need secrets declare which, and receive them from the harness at
  execution time; secrets live in config/env, never in prompts or memory.
- The redaction hook is one choke point applied to both model context and logs.
