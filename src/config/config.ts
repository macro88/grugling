// Profile-based config loader. Hand-edited config.yaml for MVP; env vars
// override individual fields so a box can be pointed at a different model
// without touching the file (PRD › Config loader). Precedence:
//   built-in defaults  <  selected profile in file  <  env vars

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

export interface ProfileConfig {
  baseUrl: string;
  model: string;
  decisionMaxTokens: number; // tokens per constrained decision (Route/Decide) — tiny
  voiceMaxTokens: number; // tokens for a free-text Voice reply — host-sized
  voiceTemperature: number; // sampling temperature at Voice; 0 = deterministic
  // Allow model-side reasoning ("thinking"). Off by default: grugling's harness
  // *is* the planner (ADR-0003), so model reasoning is wasted tokens + latency,
  // and on a reasoning model it silently eats the output budget before the reply
  // (or the grammar-constrained token) is ever emitted.
  reasoning: boolean;
  contextBudget: number;
  loopCap: number; // max Decide iterations per task — a confused model can't loop forever
}

export type ResolvedConfig = ProfileConfig & { profile: string };

export interface ConfigFile {
  profile?: string;
  profiles?: Record<string, Partial<ProfileConfig>>;
}

// Reference hardware defaults (PRD › Further Notes): gemma-4-E4B at 4096 ctx.
export const DEFAULT_CONFIG: ProfileConfig = {
  baseUrl: "http://127.0.0.1:8080/v1",
  model: "gemma-4-E4B",
  decisionMaxTokens: 64,
  voiceMaxTokens: 512,
  voiceTemperature: 0,
  reasoning: false,
  contextBudget: 4096,
  loopCap: 5,
};

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function envNumber(name: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

function envBool(name: string, raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new Error(`${name} must be true/false, got "${raw}"`);
}

// Pure resolution — IO-free so it is straightforward to test.
export function resolveConfig(file: ConfigFile | null, env: NodeJS.ProcessEnv = {}): ResolvedConfig {
  const profile = env.GRUGLING_PROFILE ?? file?.profile ?? "default";
  const fromFile = stripUndefined(file?.profiles?.[profile] ?? {});
  const fromEnv = stripUndefined({
    baseUrl: env.GRUGLING_BASE_URL,
    model: env.GRUGLING_MODEL,
    decisionMaxTokens: envNumber("GRUGLING_DECISION_MAX_TOKENS", env.GRUGLING_DECISION_MAX_TOKENS),
    voiceMaxTokens: envNumber("GRUGLING_VOICE_MAX_TOKENS", env.GRUGLING_VOICE_MAX_TOKENS),
    voiceTemperature: envNumber("GRUGLING_VOICE_TEMPERATURE", env.GRUGLING_VOICE_TEMPERATURE),
    reasoning: envBool("GRUGLING_REASONING", env.GRUGLING_REASONING),
    contextBudget: envNumber("GRUGLING_CONTEXT_BUDGET", env.GRUGLING_CONTEXT_BUDGET),
    loopCap: envNumber("GRUGLING_LOOP_CAP", env.GRUGLING_LOOP_CAP),
  });
  return { profile, ...DEFAULT_CONFIG, ...fromFile, ...fromEnv };
}

export function loadConfig(opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): ResolvedConfig {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const path = env.GRUGLING_CONFIG ?? `${cwd}/config.yaml`;

  let file: ConfigFile | null = null;
  try {
    file = (parseYaml(readFileSync(path, "utf8")) ?? {}) as ConfigFile;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return resolveConfig(file, env);
}
