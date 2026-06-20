#!/usr/bin/env node
// grugling CLI — a one-shot client onto the harness core (slice 2). Routes one
// message (chat | task) and, for chat, replies in the SOUL persona via Voice.
// Config + provider + logging + soul are wired here; the pipeline lives in the
// harness.

import { loadConfig } from "./config/config.ts";
import { handleMessage } from "./harness/pipeline.ts";
import { loadSoul } from "./harness/soul.ts";
import { createLogger } from "./logging/logger.ts";
import { createLlamaCppProvider } from "./provider/llamacpp.ts";

async function main(argv: string[]): Promise<number> {
  const message = argv[2];
  if (!message || message === "-h" || message === "--help") {
    process.stderr.write('usage: grugling "<message>"\n');
    return message ? 0 : 1;
  }

  const config = loadConfig();
  const soul = loadSoul();
  const provider = createLlamaCppProvider({
    baseUrl: config.baseUrl,
    model: config.model,
    logger: createLogger(),
    defaultMaxTokens: config.decisionMaxTokens,
    reasoning: config.reasoning,
  });

  const result = await handleMessage(provider, message, {
    soul,
    voiceMaxTokens: config.voiceMaxTokens,
    voiceTemperature: config.voiceTemperature,
  });

  if (result.kind === "error") {
    process.stderr.write(`grug broke: ${result.message}\n`);
    return 1;
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
