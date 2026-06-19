// The per-message pipeline (ADR-0003): Route → (chat → Voice | task → loop).
// Slice 2 wires the conversation entry path — Route classifies, chat goes to the
// Voice persona reply, and the task branch is a stub until the Decide loop lands
// (slice 3). The model is reached only through the Provider port, so a scripted
// fake Provider makes the whole pipeline deterministic in tests (PRD › Testing).

import type { Provider } from "../provider/provider.ts";
import { route } from "./route.ts";
import { voice } from "./voice.ts";

export interface ChatReply {
  kind: "chat";
  reply: string;
}

export interface TaskReply {
  kind: "task";
  reply: string;
}

// Route or Voice could not produce a usable result (server down, or a response
// that wouldn't constrain). Surfaced, never silently turned into a chat reply.
export interface PipelineError {
  kind: "error";
  message: string;
}

export type PipelineResult = ChatReply | TaskReply | PipelineError;

// Placeholder until the Decide loop is built (slice 3). Deliberately not a
// persona reply — the task path has no facts to voice yet.
const TASK_STUB = "task routing works; task execution is not built yet";

export async function handleMessage(
  provider: Provider,
  message: string,
  opts: { soul: string; voiceMaxTokens: number },
): Promise<PipelineResult> {
  const routed = await route(provider, message);
  if (!routed.ok) return { kind: "error", message: `cannot reach model: ${routed.error}` };
  if (!routed.conformant) {
    return { kind: "error", message: `no usable route decision (raw: ${JSON.stringify(routed.raw)})` };
  }

  if (routed.value!.route === "task") {
    return { kind: "task", reply: TASK_STUB };
  }

  const spoken = await voice(provider, { soul: opts.soul, message, maxTokens: opts.voiceMaxTokens });
  if (!spoken.ok) return { kind: "error", message: `cannot reach model: ${spoken.error}` };
  return { kind: "chat", reply: spoken.text };
}
