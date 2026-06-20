#!/usr/bin/env node
// grugling CLI — a one-shot client onto the harness core (slice 2). Routes one
// message (chat | task) and, for chat, replies in the SOUL persona via Voice.
// Config + provider + logging + soul are wired here; the pipeline lives in the
// harness.

import { loadConfig } from "./config/config.ts";
import { createDeterministicCompressor } from "./harness/compress.ts";
import { handleMessage } from "./harness/pipeline.ts";
import { loadSoul } from "./harness/soul.ts";
import { createLogger } from "./logging/logger.ts";
import { createLlamaCppProvider } from "./provider/llamacpp.ts";
import { createNowTool } from "./tools/now.ts";
import { createRegistry } from "./tools/registry.ts";

async function main(argv: string[]): Promise<number> {
  const message = argv[2];
  if (!message || message === "-h" || message === "--help") {
    process.stderr.write('usage: grugling "<message>"\n');
    return message ? 0 : 1;
  }

  const config = loadConfig();
  const soul = loadSoul();
  const logger = createLogger();
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

main(process.argv)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e: unknown) => {
    process.stderr.write(`grug broke: ${(e as Error).message}\n`);
    process.exitCode = 1;
  });
