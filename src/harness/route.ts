// Route: the cheap call-site that classifies an incoming message as chat or
// task (CONTEXT.md). The walking skeleton's single constrained decision — it
// also establishes the test seam (a scripted fake Provider drives this).

import { compileToGbnf, enumDecisionSchema, matchesEnumSchema } from "../provider/gbnf.ts";
import type { DecideResult, Provider } from "../provider/provider.ts";

export const ROUTE_VALUES = ["chat", "task"] as const;
export type RouteValue = (typeof ROUTE_VALUES)[number];

export const ROUTE_SCHEMA = enumDecisionSchema("route", [...ROUTE_VALUES]);
const ROUTE_GRAMMAR = compileToGbnf(ROUTE_SCHEMA);

// Per-call-site fragment only — no global system prompt (ADR-0006).
export const ROUTE_SYSTEM =
  "Classify the user's message. Answer 'chat' for greetings, small talk, or a " +
  "simple question; answer 'task' when it asks you to do something that needs " +
  "tools or actions.";

export interface RouteDecision {
  route: RouteValue;
}

export function route(provider: Provider, message: string): Promise<DecideResult<RouteDecision>> {
  return provider.decide<RouteDecision>({
    system: ROUTE_SYSTEM,
    user: message,
    grammar: ROUTE_GRAMMAR,
    callSite: "route",
    conformsTo: (v) => matchesEnumSchema(ROUTE_SCHEMA, v),
  });
}
