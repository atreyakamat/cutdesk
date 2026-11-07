import { describe, expect, it } from "vitest";
import { CATALOG, CATEGORIES } from "./catalog";

describe("gallery catalog", () => {
  it("generates a sizeable set of shapes", () => {
    expect(CATALOG.length).toBeGreaterThan(80);
  });

  it("gives every shape a closed path and a positive bounding box", () => {
    for (const s of CATALOG) {
      expect(s.d.startsWith("M ")).toBe(true);
      expect(s.d.trimEnd().endsWith("Z")).toBe(true);
      expect(s.width).toBeGreaterThan(0);
      expect(s.height).toBeGreaterThan(0);
    }
  });

  it("uses unique ids", () => {
    expect(new Set(CATALOG.map((s) => s.id)).size).toBe(CATALOG.length);
  });

  it("exposes the categories present in the catalog", () => {
    expect(CATEGORIES).toContain("Basic");
    expect(CATEGORIES).toContain("Stars");
    for (const c of CATEGORIES) expect(CATALOG.some((s) => s.category === c)).toBe(true);
  });
});
