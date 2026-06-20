// Voice: the persona call-site (CONTEXT.md). It turns intent into the
// user-facing reply, in grug's voice. The *only* place grugling has personality,
// and the one unconstrained (free-text) call-site (ADR-0003) — so it uses the
// Provider's `generate`, not `decide`.
//
// Prompt is assembled from fixed slots (ADR-0006): the SOUL persona + this
// call-site's own terse-reply instruction. There is no global system prompt;
// SOUL is injected here and nowhere else.

import type { GenerateResult, Provider } from "../provider/provider.ts";
import { assembleSystem } from "./prompt.ts";

// Per-call-site fragment. SOUL already carries the persona; this only nudges the
// shape of *this* reply (terse, no filler) without re-stating the voice.
export const VOICE_INSTRUCTION =
  "Reply to the user as grug. Keep it short and direct. No filler, no preamble.";

// The reply budget and temperature are host-sized, not constants: a 1B model on
// a Pi and a 200B model on a workstation want very different lengths, and the
// persona is the one call-site where sampling >0 may be wanted. Both come from
// the config profile (`voiceMaxTokens` / `voiceTemperature`) — PRD › user story 18.
export function voice(
  provider: Provider,
  args: { soul: string; message: string; maxTokens: number; temperature: number },
): Promise<GenerateResult> {
  return provider.generate({
    system: assembleSystem(args.soul, VOICE_INSTRUCTION),
    user: args.message,
    callSite: "voice",
    maxTokens: args.maxTokens,
    temperature: args.temperature,
  });
}
