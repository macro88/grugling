# Two context regimes: stateless loop, stateful conversation

Grugling separates a stateless **decision loop** (tools, schema-constrained, no
history, produces *facts*) from a stateful **conversation** (persona, history,
its own compaction, produces the *reply*). They meet in a per-message pipeline:
**Route → Decide (loop) → Voice**. The decision loop never talks to the user;
the persona layer never formats a tool call.

We chose this because each model call then does exactly one thing a small model
can do reliably, and because the loop's efficiency must not be polluted by
conversational context, nor the persona by tool-calling mechanics.

## Consequences

- A task message costs up to three model calls (Route, Decide×N, Voice) instead
  of one. Accepted: each call is small, constrained, and reliable, which matters
  more than round-trips on local inference.
- Conversation history is ephemeral, scoped to a Session with a configurable
  TTL; durable Memory is a separate concern. On TTL expiry the active context is
  evicted (after a resume-summary is taken) and the user is notified.
- `Voice` is the single channel for *all* user-facing output, including
  proactive notifications, so the Messaging adapter must support initiating
  messages, not only replying.
