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
  contextBudget: number;
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
  voiceMaxTokens: 256,
  contextBudget: 4096,
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

// Pure resolution — IO-free so it is straightforward to test.
export function resolveConfig(file: ConfigFile | null, env: NodeJS.ProcessEnv = {}): ResolvedConfig {
  const profile = env.GRUGLING_PROFILE ?? file?.profile ?? "default";
  const fromFile = stripUndefined(file?.profiles?.[profile] ?? {});
  const fromEnv = stripUndefined({
    baseUrl: env.GRUGLING_BASE_URL,
    model: env.GRUGLING_MODEL,
    decisionMaxTokens: envNumber("GRUGLING_DECISION_MAX_TOKENS", env.GRUGLING_DECISION_MAX_TOKENS),
    voiceMaxTokens: envNumber("GRUGLING_VOICE_MAX_TOKENS", env.GRUGLING_VOICE_MAX_TOKENS),
    contextBudget: envNumber("GRUGLING_CONTEXT_BUDGET", env.GRUGLING_CONTEXT_BUDGET),
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
