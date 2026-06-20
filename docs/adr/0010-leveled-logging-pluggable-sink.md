# Leveled logging with a pluggable sink

Grugling emits structured JSONL through a minimal `Logger` hook — one event per
model call and tool call, with constraint-conformance as the headline metric
(ARCHITECTURE.md › Instrumentation). We needed a `--verbose` debugging mode that
surfaces the **full request and full response** of every model call, and we
wanted the log destination to be swappable (the terminal now, a structured-log
backend later).

We **adopt a deliberately small subset of the .NET `Microsoft.Extensions.Logging`
shape**: a severity-ordered `LogLevel` enum (`Trace=0 … Critical=5, None=6`), a
single **minimum-level filter**, an **`isEnabled(level)`** guard, and a
**`LogSink` port** that receives the structured event (not a pre-formatted
string). `--verbose` lowers the minimum level to `Debug`; the `model_call` event
still logs at `Info` and is **enriched with the full request body and full server
response only when `isEnabled(Debug)`** is true. Default minimum level is `Info`
(today's behaviour — every metric line still prints); the default sink serialises
`{ level, ...event }` as JSONL to stderr.

We record this because the chosen scope is a deliberate trade-off:

- **Why a level, not a boolean.** Verbose falls out of "lower the minimum level
  to Debug" — the same idiom .NET uses. The `isEnabled(Debug)` guard means a full
  request/response is only serialised when something is listening, so the
  non-verbose path pays nothing.
- **Why a sink port.** The old `Logger`'s injectable `write` fn was already a
  proto-sink. Formalising it into a port that takes the structured event is a
  small deepening that fits ports-and-adapters (ADR-0001): stderr-JSONL is the
  first adapter; a pino/Serilog-style backend can be another, later.
- **What we explicitly skip.** `ILoggerFactory`, per-class categories, scopes
  (`BeginScope`), `EventId`, message-template formatting, source generators, and
  DI integration — framework where a function suffices (CLAUDE.md › Simplicity).
  We add **no** logging dependency: Serilog is .NET, and its Node equivalents
  (pino/winston) are deferred. We define the `LogSink` interface and keep the one
  stderr-JSONL sink.

## Secrets boundary (known gap)

Verbose writes the request and response **unredacted** — and for a task the
request body carries the gathered *facts* and *tool args* the Decision loop
assembled. ADR-0008 commits to a redaction hook that scrubs logs, but that hook
**does not exist yet**. We accept the gap: `--verbose` is opt-in, off by default,
and local-terminal-only. The architectural constraint we record now: when the
redaction hook lands it **must sit at the `LogSink.write` boundary**, so one choke
point covers both the normal metric lines and the verbose request/response.

## Consequences

- `postChat` must surface the request `body` and the parsed response JSON it
  currently discards, so the `log()` call can attach them.
- Every existing `log()` call carries an explicit level: `model_call` and
  `tool_call` → `Info`, `fallback` → `Warn`, `trust_boundary` → `Error`.
- The default JSONL output gains a `level` field (a deliberate, small format
  change; the logger test updates accordingly).
- The CLI gains minimal `--verbose` parsing — today `argv[2]` is the message
  directly; the message becomes the first non-flag positional.
- A natural future extension, **not built**: drive the minimum level from
  config/env (`GRUGLING_LOG_LEVEL`) as well as the flag.

## Considered options

- **Full `ILogger` adoption** — rejected as framework ceremony for a small CLI.
- **A separate human-readable verbose stream** alongside the JSONL — rejected:
  verbose is wanted as machine-parseable fields on the existing `model_call`
  event, for detailed reporting as well as debugging.
- **A bare `verbose` boolean on the Provider** — rejected in favour of a level,
  which generalises, gives `isEnabled`, and keeps the Provider unaware of the
  presentation concern.
