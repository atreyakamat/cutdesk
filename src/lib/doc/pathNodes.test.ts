import { describe, expect, it } from "vitest";
import { deleteNode, insertNode, moveHandle, nearestOnPath, parsePath, pathAnchors, serializePath } from "./pathData";

const anchors = (segs: ReturnType<typeof parsePath>) => pathAnchors(segs).map((a) => [Number(a.x.toFixed(2)), Number(a.y.toFixed(2))]);

describe("insertNode", () => {
  it("splits a line segment at the midpoint", () => {
    const segs = insertNode(parsePath("M0 0L10 0"), 1, 0.5);
    expect(anchors(segs)).toEqual([[0, 0], [5, 0], [10, 0]]);
  });

  it("splits a cubic with de Casteljau (midpoint on the curve)", () => {
    // P0(0,0) P1(0,10) P2(10,10) P3(10,0) → t=0.5 point is (5, 7.5).
    const segs = insertNode(parsePath("M0 0C0 10 10 10 10 0"), 1, 0.5);
    const a = anchors(segs);
    expect(a).toHaveLength(3);
    expect(a[1]).toEqual([5, 7.5]);
  });

  it("is a no-op on the M segment or an out-of-range index", () => {
    const segs = parsePath("M0 0L10 0");
    expect(serializePath(insertNode(segs, 0, 0.5))).toBe(serializePath(segs));
    expect(serializePath(insertNode(segs, 9, 0.5))).toBe(serializePath(segs));
  });
});

describe("deleteNode", () => {
  it("removes a middle anchor", () => {
    const segs = deleteNode(parsePath("M0 0L10 0L10 10"), 1);
    expect(anchors(segs)).toEqual([[0, 0], [10, 10]]);
  });

  it("won't delete below two anchors, nor the M", () => {
    const two = parsePath("M0 0L10 0");
    expect(serializePath(deleteNode(two, 1))).toBe(serializePath(two)); // would leave 1 anchor
    const three = parsePath("M0 0L10 0L10 10");
    expect(serializePath(deleteNode(three, 0))).toBe(serializePath(three)); // can't delete M
  });
});

describe("nearestOnPath", () => {
  it("finds the nearest segment and parameter to a point", () => {
    const hit = nearestOnPath(parsePath("M0 0L10 0L10 10"), { x: 5, y: 1 })!;
    expect(hit.seg).toBe(1);
    expect(hit.t).toBeCloseTo(0.5, 1);
  });

  it("returns null for a path with no drawable segment", () => {
    expect(nearestOnPath(parsePath("M5 5"), { x: 0, y: 0 })).toBeNull();
  });
});

describe("moveHandle", () => {
  it("moves a cubic's incoming handle", () => {
    const segs = moveHandle(parsePath("M0 0C0 10 10 10 10 0"), 1, "in", 5, 0);
    const c = segs[1] as { x2: number };
    expect(c.x2).toBeCloseTo(15, 6);
  });

  it("moves the outgoing handle of the following segment", () => {
    const segs = moveHandle(parsePath("M0 0C0 10 10 10 10 0C10 -10 20 -10 20 0"), 1, "out", 0, 5);
    const next = segs[2] as { y1: number };
    expect(next.y1).toBeCloseTo(-5, 6); // -10 + 5
  });
});
