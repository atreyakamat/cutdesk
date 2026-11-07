import { describe, expect, it } from "vitest";
import { registrationMarkRects, registrationMarksSvg } from "./registration";
import type { Mat } from "./types";

const mat: Mat = { preset: "custom", width: 200, height: 300 };

describe("registration marks", () => {
  it("places three L-brackets (six rects) inside the mat", () => {
    const rects = registrationMarkRects(mat);
    expect(rects).toHaveLength(6);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(mat.width);
      expect(r.y + r.h).toBeLessThanOrEqual(mat.height);
    }
  });

  it("insets the top-left bracket by the margin", () => {
    const [hArm, vArm] = registrationMarkRects(mat, { margin: 6, size: 12, thickness: 1.2 });
    expect(hArm).toMatchObject({ x: 6, y: 6, w: 12, h: 1.2 });
    expect(vArm).toMatchObject({ x: 6, y: 6, w: 1.2, h: 12 });
  });

  it("mirrors the top-right bracket against the mat width", () => {
    const rects = registrationMarkRects(mat, { margin: 6, size: 12, thickness: 1.2 });
    const trHorizontal = rects[2];
    // Right arm ends at width - margin.
    expect(trHorizontal.x + trHorizontal.w).toBeCloseTo(mat.width - 6, 6);
  });

  it("renders a black marks group as SVG", () => {
    const svg = registrationMarksSvg(mat);
    expect(svg).toContain('id="registration-marks"');
    expect(svg).toContain('fill="#000000"');
    expect((svg.match(/<rect /g) ?? []).length).toBe(6);
  });
});
