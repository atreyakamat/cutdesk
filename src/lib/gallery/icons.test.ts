import { describe, expect, it } from "vitest";
import { parsePath, segsBBox } from "@/lib/doc/pathData";
import { CATALOG, CATEGORIES } from "./catalog";
import { ICONS } from "./icons";

describe("icon pack", () => {
  it("bundles a non-trivial, well-formed set of icons", () => {
    expect(ICONS.length).toBeGreaterThan(100);
    for (const s of ICONS) {
      expect(s.category).toBe("Icons");
      expect(s.d.startsWith("M")).toBe(true);
      expect(s.width).toBeGreaterThan(0);
      expect(s.height).toBeGreaterThan(0);
    }
  });

  it("every icon parses to real, finite geometry (no S/T/A or junk)", () => {
    for (const s of ICONS) {
      const segs = parsePath(s.d);
      expect(segs.length).toBeGreaterThan(1);
      const b = segsBBox(segs)!;
      expect([b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)).toBe(true);
    }
  });

  it("shows up in the gallery as its own category", () => {
    expect(CATEGORIES).toContain("Icons");
    expect(CATALOG.some((s) => s.category === "Icons")).toBe(true);
  });
});
