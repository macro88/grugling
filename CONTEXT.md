# Grugling

Grugling is a brutally simple personal assistant designed to run on whatever
modest hardware you have spare — an old laptop, CPU inference, a tiny context
budget. It exists to test how useful a *small* local model can be when
surrounded by excellent deterministic tooling, and to grow into an assistant you
actually use.

## Language

### Roles & flow

**Harness**:
The small, stable core of grugling. It owns the loop, the state, and the context
budget, and orchestrates everything else through swappable ports. The model is
called only to resolve specific decisions.
_Avoid_: framework, engine, runtime.

**Worker**:
Whatever does the actual work — the tools and the harness itself. The model is
explicitly never the worker.
_Avoid_: executor.

**Decision loop**:
The bounded, capped-iteration loop the harness runs to carry out a task. Each
iteration is one constrained model decision followed by one deterministic
action. Stateless and efficient — it holds no conversation.
_Avoid_: agent loop, ReAct loop, reasoning loop.

**Call-site**:
A place where the harness invokes the model. Grugling has no single
"conversation"; it has distinct call-sites, each given a freshly assembled
prompt and usually a schema its output must satisfy.

**Route**:
The cheap call-site that classifies an incoming message as chat or task.

**Task**:
A message some in-scope tool can help answer or carry out. What makes a message
a task is that a tool applies — not its grammatical form: a question like "what
is the time?" is a task whenever a tool can answer it. Routed into the Decision
loop.

**Chat**:
A message grug answers as himself, needing no tool — a greeting, small talk, an
opinion, or a question about who he is. Routed straight to Voice. (Distinct from
the avoided sense under Session: here "chat" names a message category, never a
stateful thread.)

**Decide**:
The call-site inside the decision loop that chooses the next tool (or to
finish). Produces *facts*, never user-facing prose.

**Voice**:
The persona call-site that turns the loop's factual result into the user-facing
reply, and handles every other user-facing emission (confirmations,
notifications). The only place grugling has personality.
_Avoid_: responder.

**Soul**:
Grugling's stable identity and operating constitution, carried into the Voice
call-site.

### Extensibility

**Tool**:
A single deterministic capability the harness can invoke — from running an
allowlisted command to delegating to a larger cloud model. Every tool exposes
the same contract, so adding one never changes the harness.
_Avoid_: function, command, action.

**Skill**:
A self-contained bundle — instructions, a narrowed set of allowed tools, and
optional scripts — describing how to do one kind of work. Only a skill's name
and one-line description stay in context; its detail loads when selected.
Selecting a skill narrows the tools in scope, which keeps the model reliable.
_Avoid_: plugin, mode, capability.

**Hook**:
A named point in the harness lifecycle (e.g. after a tool runs, when context is
under pressure, when a session is purged) where external modules attach
behaviour without modifying the core.
_Avoid_: callback, middleware.

### State & memory

**Session**:
A stateful conversation thread (Telegram or CLI) with a configurable
time-to-live. When it expires its active context is evicted and the user is
notified; durable memory survives.
_Avoid_: chat, thread.

**Conversation history**:
The verbatim record of a session's turns. Lives only in the conversation regime;
never enters the decision loop. May be summarised for resume or distilled into
memory.
_Avoid_: transcript, log.

**Memory**:
The agent's durable, operational knowledge about its world and its user — small
structured facts that outlive any session. Distinct from conversation history
(ephemeral) and from the vault (the user's, not the agent's).
_Avoid_: database, knowledge base.

**Vault**:
The user's own knowledge base (e.g. an Obsidian folder) that grugling may one day
read and write *on the user's behalf*. Not part of the core and not the agent's
memory — a future skill.
_Avoid_: notes, memory.

### Context discipline

**Context budget**:
The hard token ceiling on everything the model sees in one call, sized to the
host machine by configuration. The dominant constraint of the whole system.
_Avoid_: context window, token limit.

**Compression**:
Shrinking a *single tool's* raw output before it enters context. Deterministic
by default.
_Avoid_: summarisation.

**Compaction**:
Shrinking the *running conversation* when it nears the context budget. The
strategy is pluggable; detecting the pressure is the harness's own job.
_Avoid_: truncation, compression.

### Safety

**Trust boundary**:
The rule that raw untrusted content may only be read by a call-site with no
actuating tools, and must be distilled into plain facts before any
decision-making step can see it.
_Avoid_: sandbox.

**Untrusted content**:
Tool output originating outside grugling's control (fetched pages, scraped
sites, emails) that could carry prompt-injection. Tagged on the tool result and
confined by the trust boundary.
_Avoid_: external data.

**Secrets boundary**:
The rule that the model never sees raw secrets (keys, tokens, environment
variables). Tools wield them internally and the model refers to them by handle;
a redaction hook scrubs any that leak into context or logs.
_Avoid_: secret management.

### Observability

**Structured log**:
The JSONL stream of events the harness emits — one per model call and tool call —
carrying metrics like constraint-conformance, token counts and latency. Each
event has a severity *level*; a minimum-level filter decides what reaches the
sink. Written to stderr so it never pollutes the CLI's stdout reply.
_Avoid_: trace, audit log.

**Verbose mode**:
The `--verbose` debugging mode. It lowers the minimum log level to `Debug`, which
enriches each `model_call` event with the full request sent to the model and the
full response received. Opt-in, off by default.
_Avoid_: debug flag, trace mode.

### Ports

**Log sink**:
The port a log event is written to. Its first adapter serialises events as JSONL
to stderr; a structured-log backend could be another. The future redaction hook
(ADR-0008) sits here, so one choke point scrubs every log line.
_Avoid_: appender, transport, logger.


**Provider**:
The port through which the harness reaches a model. Its first adapter speaks the
OpenAI-compatible HTTP API, and it carries the "return output matching this
schema" capability.
_Avoid_: client, backend, LLM.

**Messaging adapter**:
The port for talking to the user. Bidirectional and proactive — the harness both
replies and initiates messages. Its first adapter is Telegram.
_Avoid_: channel, bot.
