import { describe, expect, it } from "vitest";
import { arcWarpPath } from "./arcWarp";
import { parsePath, segsBBox } from "./pathData";

const bboxH = (d: string) => {
  const b = segsBBox(parsePath(d))!;
  return b.maxY - b.minY;
};

describe("arcWarpPath", () => {
  it("is a no-op at zero curvature", () => {
    const d = "M0 0L100 0L100 10L0 10Z";
    expect(arcWarpPath(d, 100, 0)).toBe(d);
  });

  it("bends a flat strip into a curve (taller bounding box)", () => {
    const flat = "M0 0L50 0L100 0"; // sampled midpoint so the apex is captured
    expect(bboxH(flat)).toBeCloseTo(0, 6);
    expect(bboxH(arcWarpPath(flat, 100, 90))).toBeGreaterThan(5);
  });

  it("curves in opposite directions depending on the sign", () => {
    const up = segsBBox(parsePath(arcWarpPath("M0 0L50 0L100 0", 100, 60)))!;
    const down = segsBBox(parsePath(arcWarpPath("M0 0L50 0L100 0", 100, -60)))!;
    expect(up.maxY).toBeGreaterThan(0); // ends dip one way
    expect(down.minY).toBeLessThan(0); // the other way
  });

  it("is safe for degenerate input", () => {
    expect(arcWarpPath("M0 0L10 0", 0, 90)).toBe("M0 0L10 0"); // zero width → flat
    expect(() => arcWarpPath("", 100, 90)).not.toThrow();
  });
});
