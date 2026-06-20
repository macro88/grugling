// The per-message pipeline (ADR-0003): Route → (chat → Voice | task → Decide
// loop → Voice). Route classifies; chat goes straight to a persona reply; a task
// runs the bounded Decision loop to gather facts, which Voice turns into the
// reply. The model is reached only through the Provider port, so a scripted fake
// Provider makes the whole pipeline deterministic in tests (PRD › Testing).

import type { Logger } from "../logging/logger.ts";
import type { Provider } from "../provider/provider.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import type { Compressor } from "./compress.ts";
import type { Fact } from "./decide.ts";
import { runDecisionLoop } from "./loop.ts";
import { route } from "./route.ts";
import { voice } from "./voice.ts";

export interface ChatReply {
  kind: "chat";
  reply: string;
}

export interface TaskReply {
  kind: "task";
  reply: string;
  // Set when the reply is the fallback ladder's last rung (a non-conformant
  // Decide, surfaced and logged — never a silent chat reply). ADR-0002.
  fallback?: boolean;
}

// Route, the loop, or Voice could not produce a usable result (server down, or a
// response that wouldn't constrain). Surfaced, never silently turned into a chat reply.
export interface PipelineError {
  kind: "error";
  message: string;
}

export type PipelineResult = ChatReply | TaskReply | PipelineError;

export interface HandleOptions {
  soul: string;
  voiceMaxTokens: number;
  voiceTemperature: number;
  registry: ToolRegistry;
  compressor: Compressor;
  loopCap: number;
  decisionMaxTokens: number;
  logger?: Logger;
}

export async function handleMessage(
  provider: Provider,
  message: string,
  opts: HandleOptions,
): Promise<PipelineResult> {
  const routed = await route(provider, message);
  if (!routed.ok) return { kind: "error", message: `cannot reach model: ${routed.error}` };
  if (!routed.conformant) {
    return { kind: "error", message: `no usable route decision (raw: ${JSON.stringify(routed.raw)})` };
  }

  if (routed.value!.route === "task") {
    return runTask(provider, message, opts);
  }

  const spoken = await voice(provider, {
    soul: opts.soul,
    message,
    maxTokens: opts.voiceMaxTokens,
    temperature: opts.voiceTemperature,
  });
  if (!spoken.ok) return { kind: "error", message: `cannot reach model: ${spoken.error}` };
  return { kind: "chat", reply: spoken.text };
}

async function runTask(provider: Provider, message: string, opts: HandleOptions): Promise<PipelineResult> {
  const outcome = await runDecisionLoop(provider, {
    registry: opts.registry,
    message,
    cap: opts.loopCap,
    compressor: opts.compressor,
    decisionMaxTokens: opts.decisionMaxTokens,
    logger: opts.logger,
  });

  if (outcome.kind === "error") return { kind: "error", message: `cannot reach model: ${outcome.error}` };
  if (outcome.kind === "blocked") {
    // Trust boundary fired (ADR-0005); already logged in the loop. Fail closed —
    // never silently use untrusted content.
    return { kind: "error", message: `trust boundary: tool "${outcome.tool}" returned untrusted output grug cannot use safely yet` };
  }
  if (outcome.kind === "fallback") {
    // Treat-as-answer: already logged in the loop. Surfaced as a task reply, not
    // a silent chat reply (ADR-0002).
    return { kind: "task", reply: outcome.raw, fallback: true };
  }

  // Voice turns the loop's facts into the reply (Decide makes facts; Voice speaks).
  const spoken = await voice(provider, {
    soul: opts.soul,
    message: factsForVoice(message, outcome.facts),
    maxTokens: opts.voiceMaxTokens,
    temperature: opts.voiceTemperature,
  });
  if (!spoken.ok) return { kind: "error", message: `cannot reach model: ${spoken.error}` };
  return { kind: "task", reply: spoken.text };
}

// The Voice input for a task: the original request plus the gathered facts, as
// plain data. Voice answers the request *from these facts* in grug's persona.
function factsForVoice(message: string, facts: Fact[]): string {
  const block = facts.length
    ? `facts:\n${facts.map((f) => `- ${f.summary}`).join("\n")}`
    : "no facts gathered";
  return `user asked: ${message}\n\n${block}`;
}
