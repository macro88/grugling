import { describe, expect, it } from "vitest";
import { assembleSystem } from "./prompt.ts";

describe("assembleSystem", () => {
  it("joins present slots in order with a blank line between them", () => {
    expect(assembleSystem("persona", "instruction")).toBe("persona\n\ninstruction");
  });

  it("drops empty/whitespace slots so order stays stable", () => {
    expect(assembleSystem(undefined, "persona", "  ", "instruction")).toBe("persona\n\ninstruction");
  });

  it("trims each slot", () => {
    expect(assembleSystem("  persona\n", "\ninstruction  ")).toBe("persona\n\ninstruction");
  });

  it("returns an empty string when no slots are present", () => {
    expect(assembleSystem(undefined, "")).toBe("");
  });
});
