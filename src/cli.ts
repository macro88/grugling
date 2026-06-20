#!/usr/bin/env node
// grugling CLI — a one-shot client onto the harness core (slice 2). Routes one
// message (chat | task) and, for chat, replies in the SOUL persona via Voice.
// Config + provider + logging + soul are wired here; the pipeline lives in the
// harness.

import { pathToFileURL } from "node:url";
import { loadConfig } from "./config/config.ts";
import { createDeterministicCompressor } from "./harness/compress.ts";
import { handleMessage } from "./harness/pipeline.ts";
import { loadSoul } from "./harness/soul.ts";
import { createLogger, LogLevel } from "./logging/logger.ts";
import { createLlamaCppProvider } from "./provider/llamacpp.ts";
import { createNowTool } from "./tools/now.ts";
import { createRegistry } from "./tools/registry.ts";

export interface CliArgs {
  message?: string; // the first non-flag positional
  verbose: boolean; // --verbose: log full request/response at Debug (ADR-0010)
  help: boolean; // -h / --help
}

export function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  return {
    verbose: args.includes("--verbose"),
    help: args.includes("-h") || args.includes("--help"),
    message: args.find((a) => !a.startsWith("-")),
  };
}

async function main(argv: string[]): Promise<number> {
  const { message, verbose, help } = parseArgs(argv);
  if (!message || help) {
    process.stderr.write('usage: grugling [--verbose] "<message>"\n');
    return help ? 0 : 1;
  }

  const config = loadConfig();
  const soul = loadSoul();
  // --verbose lowers the floor to Debug, which enriches model_call events with the
  // full request and response; otherwise the metric lines log at Info (ADR-0010).
  const logger = createLogger({ minLevel: verbose ? LogLevel.Debug : LogLevel.Info });
  const provider = createLlamaCppProvider({
    baseUrl: config.baseUrl,
    model: config.model,
    logger,
    defaultMaxTokens: config.decisionMaxTokens,
    reasoning: config.reasoning,
  });

  // Capabilities are added by registering a tool here — the harness never changes.
  const registry = createRegistry([createNowTool()]);

  const result = await handleMessage(provider, message, {
    soul,
    voiceMaxTokens: config.voiceMaxTokens,
    voiceTemperature: config.voiceTemperature,
    registry,
    compressor: createDeterministicCompressor(),
    loopCap: config.loopCap,
    decisionMaxTokens: config.decisionMaxTokens,
    logger,
  });

  if (result.kind === "error") {
    process.stderr.write(`grug broke: ${result.message}\n`);
    return 1;
  }

  // A fallback reply means a decision couldn't be constrained (already logged).
  if (result.kind === "task" && result.fallback) {
    process.stderr.write("grug warn: could not constrain a decision; showing raw output\n");
  }

  process.stdout.write("grug:" + result.reply + "\n");
  return 0;
}

// Run only when invoked directly (e.g. `node src/cli.ts`), not when a test
// imports this module for parseArgs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((e: unknown) => {
      process.stderr.write(`grug broke: ${(e as Error).message}\n`);
      process.exitCode = 1;
    });
}
