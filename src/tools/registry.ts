// The Tool registry (ADR-0001). A flat, name-keyed collection of tools. The
// harness asks it for the in-scope tools (to build the Decide grammar) and for a
// tool by name (to dispatch a decision) — so adding a capability is registering
// a tool here, never editing the harness.

import type { Tool } from "./tool.ts";

export interface ToolRegistry {
  get(name: string): Tool | undefined;
  list(): Tool[];
}

export function createRegistry(tools: Tool[]): ToolRegistry {
  const byName = new Map<string, Tool>();
  for (const tool of tools) {
    if (byName.has(tool.name)) throw new Error(`createRegistry: duplicate tool name "${tool.name}"`);
    byName.set(tool.name, tool);
  }
  return {
    get: (name) => byName.get(name),
    list: () => [...byName.values()],
  };
}
