import { describe, expect, it } from "vitest";
import { TOOL_KEYS } from "@/components/useShortcuts";
import { SHORTCUT_GROUPS } from "./shortcuts";

describe("SHORTCUT_GROUPS", () => {
  it("has non-empty groups, each item with keys and a label", () => {
    expect(SHORTCUT_GROUPS.length).toBeGreaterThan(0);
    for (const g of SHORTCUT_GROUPS) {
      expect(g.title.trim()).not.toBe("");
      expect(g.items.length).toBeGreaterThan(0);
      for (const it of g.items) {
        expect(it.keys.trim()).not.toBe("");
        expect(it.label.trim()).not.toBe("");
      }
    }
  });

  it("has no duplicate key binding within a group", () => {
    for (const g of SHORTCUT_GROUPS) {
      const keys = g.items.map((i) => i.keys);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("documents the essential bindings (guard against accidental removal)", () => {
    const all = SHORTCUT_GROUPS.flatMap((g) => g.items.map((i) => i.keys));
    for (const k of ["V", "R", "Ctrl Z", "Ctrl C", "Ctrl V", "Ctrl G", "?"]) {
      expect(all).toContain(k);
    }
  });

  // --- Adversarial hardening -----------------------------------------------

  it("R1: the Tools help matches the real tool bindings (no doc drift)", () => {
    const tools = SHORTCUT_GROUPS.find((g) => g.title === "Tools")!;
    const docKeys = new Set(tools.items.map((i) => i.keys.toLowerCase()));
    // Every real tool binding is documented...
    for (const k of Object.keys(TOOL_KEYS)) expect(docKeys.has(k)).toBe(true);
    // ...and every single-letter documented tool key is real ("I" = trace, handled separately).
    for (const it of tools.items) {
      if (it.keys.length === 1 && it.keys.toLowerCase() !== "i") {
        expect(TOOL_KEYS[it.keys.toLowerCase()]).toBeTruthy();
      }
    }
  });

  it("R2: keys and labels carry no markup (rendered as text)", () => {
    for (const g of SHORTCUT_GROUPS) {
      for (const it of g.items) {
        expect(it.keys).not.toMatch(/[<>]/);
        expect(it.label).not.toMatch(/[<>]/);
      }
    }
  });

  it("R3: documents the newer edit bindings too", () => {
    const all = SHORTCUT_GROUPS.flatMap((g) => g.items.map((i) => i.keys));
    for (const k of ["Ctrl X", "Ctrl Shift G", "Del"]) expect(all).toContain(k);
  });
});
