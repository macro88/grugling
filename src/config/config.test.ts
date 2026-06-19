import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveConfig } from "./config.ts";

describe("resolveConfig", () => {
  it("falls back to defaults when there is no file and no env", () => {
    expect(resolveConfig(null, {})).toEqual({ profile: "default", ...DEFAULT_CONFIG });
  });

  it("applies the selected profile from the file", () => {
    const file = {
      profile: "laptop",
      profiles: { laptop: { model: "tiny-llm", decisionMaxTokens: 32 } },
    };
    const cfg = resolveConfig(file, {});
    expect(cfg.profile).toBe("laptop");
    expect(cfg.model).toBe("tiny-llm");
    expect(cfg.decisionMaxTokens).toBe(32);
    expect(cfg.baseUrl).toBe(DEFAULT_CONFIG.baseUrl); // unset field keeps default
  });

  it("lets env override the profile selection and individual fields", () => {
    const file = { profile: "a", profiles: { a: { model: "from-a" }, b: { model: "from-b" } } };
    const cfg = resolveConfig(file, {
      GRUGLING_PROFILE: "b",
      GRUGLING_BASE_URL: "http://host:1234/v1",
      GRUGLING_DECISION_MAX_TOKENS: "128",
      GRUGLING_VOICE_MAX_TOKENS: "1024",
      GRUGLING_CONTEXT_BUDGET: "8192",
    });
    expect(cfg.profile).toBe("b");
    expect(cfg.model).toBe("from-b");
    expect(cfg.baseUrl).toBe("http://host:1234/v1");
    expect(cfg.decisionMaxTokens).toBe(128);
    expect(cfg.voiceMaxTokens).toBe(1024);
    expect(cfg.contextBudget).toBe(8192);
  });

  it("throws a clear error on a non-numeric numeric env var", () => {
    expect(() => resolveConfig(null, { GRUGLING_DECISION_MAX_TOKENS: "lots" })).toThrow(/GRUGLING_DECISION_MAX_TOKENS/);
  });
});
