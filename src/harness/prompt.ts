// Fixed-slot prompt assembly (ADR-0006). A call-site's system fragment is built
// fresh from a small, fixed set of bounded slots, in a fixed order — never a
// growing transcript, and never a global system prompt. Each call-site passes
// only the slots it needs (Route its instruction, Voice the SOUL persona + a
// terse-reply instruction); empty slots drop out so order stays stable.

export function assembleSystem(...slots: Array<string | undefined>): string {
  return slots.map((s) => s?.trim()).filter((s): s is string => Boolean(s)).join("\n\n");
}
