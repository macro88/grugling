#!/usr/bin/env node
// grugling CLI — the walking skeleton (slice 1). One constrained model call
// (Route) end-to-end, printing the conformant decision. Config + provider +
// logging are wired here; the decision itself lives in the harness.

import { loadConfig } from "./config/config.ts";
import { route } from "./harness/route.ts";
import { createLogger } from "./logging/logger.ts";
import { createLlamaCppProvider } from "./provider/llamacpp.ts";

async function main(argv: string[]): Promise<number> {
  const message = argv[2];
  if (!message || message === "-h" || message === "--help") {
    process.stderr.write('usage: grugling "<message>"\n');
    return message ? 0 : 1;
  }

  const config = loadConfig();
  const provider = createLlamaCppProvider({
    baseUrl: config.baseUrl,
    model: config.model,
    logger: createLogger(),
    defaultMaxTokens: config.maxTokens,
  });

  const result = await route(provider, message);

  if (!result.ok) {
    process.stderr.write(`grug can't reach model at ${config.baseUrl} (${config.model}): ${result.error}\n`);
    return 1;
  }
  if (!result.conformant) {
    process.stderr.write(`grug got no usable decision (raw: ${JSON.stringify(result.raw)})\n`);
    return 1;
  }

  process.stdout.write(JSON.stringify(result.value) + "\n");
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
