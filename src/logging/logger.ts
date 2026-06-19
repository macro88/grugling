// Structured logging hook. The harness emits one event per model call (and,
// later, per tool call); the headline metric is the constraint-conformance
// rate (ARCHITECTURE.md › Instrumentation). Events are written as JSONL so a
// later analysis step can read them back line by line.

export interface LogEvent {
  event: string;
  [key: string]: unknown;
}

export interface Logger {
  log(event: LogEvent): void;
}

// Default sink is stderr, so structured logs never pollute the CLI's stdout
// result. `write` is injectable for tests.
export function createLogger(
  write: (line: string) => void = (line) => void process.stderr.write(line + "\n"),
): Logger {
  return {
    log(event: LogEvent): void {
      write(JSON.stringify(event));
    },
  };
}
