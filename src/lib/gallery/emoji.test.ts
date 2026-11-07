import { describe, expect, it } from "vitest";
import { EMOJI, EMOJI_GROUPS } from "./emoji";

describe("emoji catalog", () => {
  it("has a useful set of emoji", () => {
    expect(EMOJI.length).toBeGreaterThan(100);
  });

  it("uses unique characters", () => {
    expect(new Set(EMOJI.map((e) => e.char)).size).toBe(EMOJI.length);
  });

  it("gives every emoji a name and a known group", () => {
    for (const e of EMOJI) {
      expect(e.name.length).toBeGreaterThan(0);
      expect(EMOJI_GROUPS).toContain(e.group);
    }
  });
});
