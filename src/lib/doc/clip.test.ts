import { describe, expect, it } from "vitest";
import { booleanRings, offsetRings, pointInRing, removeHoles, ringsBBox } from "./clip";
import type { Point } from "./types";

const square = (x: number, y: number, s: number): Point[] => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe("offsetRings", () => {
  it("grows a shape outward by the delta on every side", () => {
    const out = offsetRings([square(0, 0, 10)], 2);
    const b = ringsBBox(out)!;
    expect(b.minX).toBeCloseTo(-2, 1);
    expect(b.minY).toBeCloseTo(-2, 1);
    expect(b.maxX).toBeCloseTo(12, 1);
    expect(b.maxY).toBeCloseTo(12, 1);
  });

  it("returns nothing for an empty input", () => {
    expect(offsetRings([], 2)).toEqual([]);
  });
});

describe("removeHoles / pointInRing", () => {
  it("point-in-ring is true inside and false outside", () => {
    expect(pointInRing({ x: 5, y: 5 }, square(0, 0, 10))).toBe(true);
    expect(pointInRing({ x: 50, y: 50 }, square(0, 0, 10))).toBe(false);
  });

  it("drops a hole inside a larger ring but keeps separate outer rings", () => {
    const outer = square(0, 0, 20);
    const hole = square(5, 5, 10);
    expect(removeHoles([outer, hole])).toEqual([outer]);
    const twoSeparate = [square(0, 0, 10), square(50, 0, 10)];
    expect(removeHoles(twoSeparate)).toHaveLength(2);
  });
});

describe("booleanRings", () => {
  it("unions two overlapping squares into one connected region", () => {
    const out = booleanRings([square(0, 0, 10)], [square(5, 5, 10)], "union");
    const b = ringsBBox(out)!;
    expect(b.minX).toBeCloseTo(0, 1);
    expect(b.minY).toBeCloseTo(0, 1);
    expect(b.maxX).toBeCloseTo(15, 1);
    expect(b.maxY).toBeCloseTo(15, 1);
  });

  it("subtracts one shape from another (difference)", () => {
    // [0..10]x[0..10] minus [5..15]x[0..10] leaves [0..5]x[0..10].
    const out = booleanRings([square(0, 0, 10)], [square(5, 0, 10)], "difference");
    const b = ringsBBox(out)!;
    expect(b.minX).toBeCloseTo(0, 1);
    expect(b.maxX).toBeCloseTo(5, 1);
    expect(b.maxY).toBeCloseTo(10, 1);
  });

  it("intersects two shapes", () => {
    const out = booleanRings([square(0, 0, 10)], [square(5, 5, 10)], "intersection");
    const b = ringsBBox(out)!;
    expect(b.minX).toBeCloseTo(5, 1);
    expect(b.maxX).toBeCloseTo(10, 1);
  });

  it("returns [] when the clip empties the subject", () => {
    const out = booleanRings([square(0, 0, 10)], [square(0, 0, 10)], "difference");
    expect(out).toEqual([]);
  });

  // --- Adversarial hardening: polygons may be hostile/degenerate ------------

  it("R1: drops rings with non-finite or too-few points, never throws", () => {
    const bad: Point[] = [{ x: 0, y: 0 }, { x: Number.NaN, y: 10 }, { x: 10, y: 10 }];
    expect(() => offsetRings([bad], 2)).not.toThrow();
    expect(offsetRings([bad], 2)).toEqual([]);
    // A valid shape alongside a bad one still processes the valid one.
    const out = booleanRings([square(0, 0, 10), bad], [], "union");
    expect(ringsBBox(out)!.maxX).toBeCloseTo(10, 1);
    // A 2-point "ring" is dropped.
    expect(offsetRings([[{ x: 0, y: 0 }, { x: 5, y: 5 }]], 1)).toEqual([]);
  });

  it("R2: a negative offset larger than the shape collapses to nothing, no crash", () => {
    expect(() => offsetRings([square(0, 0, 10)], -20)).not.toThrow();
    expect(offsetRings([square(0, 0, 10)], -20)).toEqual([]);
  });

  it("R3: a self-intersecting (bowtie) polygon is handled without throwing", () => {
    const bowtie: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    expect(() => booleanRings([bowtie], [], "union")).not.toThrow();
    const out = booleanRings([bowtie], [], "union");
    expect(Array.isArray(out)).toBe(true);
  });
});
