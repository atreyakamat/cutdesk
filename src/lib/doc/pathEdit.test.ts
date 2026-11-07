import { describe, expect, it } from "vitest";
import { invertMatrix, matrixOf } from "./geometry";
import { moveAnchor, parsePath, pathAnchors, serializePath, transformPoint } from "./pathData";

describe("pathAnchors", () => {
  it("lists the on-curve anchor of every non-Z segment with its seg index", () => {
    const anchors = pathAnchors(parsePath("M0 0L10 0L10 10Z"));
    expect(anchors.map((a) => [a.x, a.y, a.seg])).toEqual([
      [0, 0, 0],
      [10, 0, 1],
      [10, 10, 2],
    ]);
  });
});

describe("moveAnchor", () => {
  it("moves a line anchor", () => {
    const moved = moveAnchor(parsePath("M0 0L10 0L10 10"), 1, 5, 5);
    expect(pathAnchors(moved)[1]).toMatchObject({ x: 15, y: 5 });
  });

  it("carries a cubic's incoming handle with the anchor", () => {
    const segs = parsePath("M0 0C0 10 10 10 10 0"); // anchor seg 1 at (10,0), handle x2,y2=(10,10)
    const moved = moveAnchor(segs, 1, 5, 0);
    const c = moved[1] as { x: number; y: number; x2: number; y2: number };
    expect(c.x).toBeCloseTo(15, 6);
    expect(c.x2).toBeCloseTo(15, 6); // handle moved with the anchor
  });

  it("leaves other anchors untouched and is a no-op for an out-of-range index", () => {
    const segs = parsePath("M0 0L10 0");
    expect(serializePath(moveAnchor(segs, 9, 5, 5))).toBe(serializePath(segs));
  });
});

describe("invertMatrix", () => {
  it("inverts a translate+scale so world maps back to local", () => {
    const m = matrixOf({ x: 10, y: 20, rotation: 0, scaleX: 2, scaleY: 2 });
    const inv = invertMatrix(m)!;
    const local = transformPoint(inv, 30, 60);
    expect(local.x).toBeCloseTo(10, 6);
    expect(local.y).toBeCloseTo(20, 6);
  });

  it("returns null for a degenerate (zero-determinant) matrix", () => {
    expect(invertMatrix([0, 0, 0, 0, 0, 0])).toBeNull();
  });
});
