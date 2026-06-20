// Structured logging hook. The harness emits one event per model call (and tool
// call); the headline metric is the constraint-conformance rate (ARCHITECTURE.md
// › Instrumentation). Events are written as JSONL so a later analysis step can
// read them back line by line.
//
// Modelled on a small subset of .NET's Microsoft.Extensions.Logging (ADR-0010):
// severity-ordered levels, one minimum-level filter, an isEnabled() guard, and a
// pluggable sink — the seam for a future structured-log backend and the redaction
// hook (ADR-0008). Levels are a const map (not a TS `enum`) so the source stays
// erasable for Node's type-stripping runtime.

export interface LogEvent {
  event: string;
  [key: string]: unknown;
}

// Severity-ordered, lowest to highest. `None` disables all output.
export const LogLevel = {
  Trace: 0,
  Debug: 1,
  Info: 2,
  Warn: 3,
  Error: 4,
  Critical: 5,
  None: 6,
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

const LEVEL_NAMES = ["trace", "debug", "info", "warn", "error", "critical", "none"] as const;

// The destination port for log events: it receives the structured event plus its
// level, never a pre-formatted string — so a sink can route or store fields. The
// default adapter is JSONL-to-stderr; a structured-log backend could be another.
export interface LogSink {
  write(level: LogLevel, event: LogEvent): void;
}

export interface Logger {
  log(level: LogLevel, event: LogEvent): void;
  // Cheap guard, checked before assembling an expensive payload (e.g. a full
  // request/response for verbose mode) so nothing is built when no one listens.
  isEnabled(level: LogLevel): boolean;
  debug(event: LogEvent): void;
  info(event: LogEvent): void;
  warn(event: LogEvent): void;
  error(event: LogEvent): void;
}

// Default sink: one JSON line per event to stderr, with the level as a field.
// `write` is injectable for tests.
export function createJsonlSink(
  write: (line: string) => void = (line) => void process.stderr.write(line + "\n"),
): LogSink {
  return {
    write(level, event) {
      write(JSON.stringify({ level: LEVEL_NAMES[level], ...event }));
    },
  };
}

// minLevel defaults to Info, so today's metric lines still print; --verbose lowers
// it to Debug (ADR-0010). Below-threshold events never reach the sink.
export function createLogger(opts: { minLevel?: LogLevel; sink?: LogSink } = {}): Logger {
  const minLevel = opts.minLevel ?? LogLevel.Info;
  const sink = opts.sink ?? createJsonlSink();

  const isEnabled = (level: LogLevel): boolean => minLevel !== LogLevel.None && level >= minLevel;
  const log = (level: LogLevel, event: LogEvent): void => {
    if (isEnabled(level)) sink.write(level, event);
  };

  return {
    log,
    isEnabled,
    debug: (event) => log(LogLevel.Debug, event),
    info: (event) => log(LogLevel.Info, event),
    warn: (event) => log(LogLevel.Warn, event),
    error: (event) => log(LogLevel.Error, event),
  };
}
