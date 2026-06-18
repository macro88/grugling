# Ports-and-adapters harness core

Grugling's harness is a small, stable core that orchestrates everything volatile
through stable **ports** with swappable **adapters** — the model Provider,
Memory, output Compression, conversation Compaction, and the Messaging adapter
are all adapters behind ports. Upgrading any of them (e.g. grep-based memory →
SQL + vector search) is an adapter/config change, never a harness change.

We chose this over a simpler monolithic MVP because extensibility *is* the
project: the whole point is for tools and capabilities to grow in number and
sophistication over time. We accept building the port/adapter and registry
machinery up front — more MVP effort — to avoid rewriting the core every time a
capability grows.

## Consequences

- A port must be defined by what the harness *needs*, never by how its first
  adapter happens to work (e.g. `recall` returns "facts relevant to this
  context", not "substring matches"). A leaked implementation detail breaks the
  swap.
- Correctness must never depend on an optional adapter/hook. Where an extension
  point exists, the core keeps a dumb fallback (e.g. truncate when no Compactor
  is installed).
