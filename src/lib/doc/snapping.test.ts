import { describe, expect, it } from "vitest";
import { computeSnap, distributionSnap, gridTargets, selectionBox, snapBoxes, snapTargets } from "./snapping";
import type { BBox, Doc } from "./types";

function doc(objects: Doc["objects"] = []): Doc {
  return {
    name: "T",
    unit: "mm",
    mat: { preset: "custom", width: 100, height: 100 },
    layers: [{ id: "L1", name: "Cut", operation: "cut", color: "#000", visible: true, locked: false }],
    objects,
  };
}

function rect(id: string, x: number, y: number, w = 10, h = 10): Doc["objects"][number] {
  return { id, name: id, layerId: "L1", geo: { kind: "rect", width: w, height: h, cornerRadius: 0 }, x, y, rotation: 0, scaleX: 1, scaleY: 1 };
}

const box = (minX: number, minY: number, maxX: number, maxY: number): BBox => ({ minX, minY, maxX, maxY });

describe("snapTargets", () => {
  it("always includes the mat edges and centre", () => {
    const t = snapTargets(doc(), []);
    expect(t.xs).toEqual(expect.arrayContaining([0, 50, 100]));
    expect(t.ys).toEqual(expect.arrayContaining([0, 50, 100]));
  });

  it("adds other objects' edges and centres but excludes the dragged ids", () => {
    const d = doc([rect("a", 20, 20), rect("b", 60, 60)]);
    const t = snapTargets(d, ["a"]);
    // b spans x 60..70, centre 65 — present; a's 20/25/30 — absent.
    expect(t.xs).toEqual(expect.arrayContaining([60, 65, 70]));
    expect(t.xs).not.toContain(25);
  });

  it("ignores objects on hidden layers... but a locked visible layer still counts", () => {
    const d = doc([rect("a", 20, 20)]);
    d.layers = [{ id: "L1", name: "Cut", operation: "cut", color: "#000", visible: true, locked: true }];
    expect(snapTargets(d, []).xs).toContain(25);
    d.layers[0].visible = false;
    expect(snapTargets(d, []).xs).not.toContain(25);
  });
});

describe("gridTargets", () => {
  it("produces grid lines at the step across the mat", () => {
    const g = gridTargets(20, 10, 5);
    expect(g.xs).toEqual([0, 5, 10, 15, 20]);
    expect(g.ys).toEqual([0, 5, 10]);
  });
  it("is bounded for a tiny step and safe for a non-positive step", () => {
    expect(gridTargets(1000, 1000, 0.001).xs.length).toBeLessThanOrEqual(600);
    expect(gridTargets(100, 100, 0)).toEqual({ xs: [], ys: [] });
    expect(gridTargets(100, 100, Number.NaN)).toEqual({ xs: [], ys: [] });
  });
});

describe("computeSnap", () => {
  const lines = { xs: [0, 50, 100], ys: [0, 50, 100] };

  it("snaps a near edge onto the line and reports the guide", () => {
    // box left edge at 2 is within tolerance 3 of the mat edge at 0.
    const r = computeSnap(box(2, 40, 12, 50), lines, 3);
    expect(r.dx).toBeCloseTo(-2, 6);
    expect(r.guideX).toBe(0);
  });

  it("snaps the box centre to the mat centre", () => {
    // centre at 49 → should pull +1 onto 50.
    const r = computeSnap(box(44, 44, 54, 54), lines, 3);
    expect(r.dx).toBeCloseTo(1, 6);
    expect(r.guideX).toBe(50);
  });

  it("does not snap when nothing is within tolerance", () => {
    const r = computeSnap(box(20, 20, 30, 30), lines, 3);
    expect(r).toEqual({ dx: 0, dy: 0, guideX: null, guideY: null });
  });

  it("snaps the two axes independently", () => {
    // box x lines are 98 / 103 / 108; nearest to the only target 100 is 98 (dist 2), so dx = +2.
    const r = computeSnap(box(98, 20, 108, 30), { xs: [100], ys: [50] }, 3);
    expect(r.dx).toBeCloseTo(2, 6);
    expect(r.guideX).toBe(100);
    expect(r.guideY).toBeNull(); // y lines 20/25/30 are all > tolerance from 50
  });
});

describe("distributionSnap", () => {
  // Two neighbours in a row at y 40..50: left ends at x 20, right starts at x 80.
  const neighbours: BBox[] = [box(10, 40, 20, 50), box(80, 40, 90, 50)];

  it("equalises the gap to the left and right neighbours and emits a spacing guide", () => {
    // Dragged box 10 wide sitting at x 44..54 → gapL 24, gapR 26; shift +1 centres it.
    const r = distributionSnap(box(44, 40, 54, 50), neighbours, 3);
    expect(r.dx).toBeCloseTo(1, 6);
    expect(r.guides).toHaveLength(1);
    expect(r.guides[0].axis).toBe("x");
    expect(r.guides[0].gap).toBeCloseTo(25, 6);
    expect(r.guides[0].spans).toHaveLength(2);
  });

  it("does nothing when the gaps are already far from equal", () => {
    const r = distributionSnap(box(25, 40, 35, 50), neighbours, 3); // gapL 5, gapR 45
    expect(r.dx).toBe(0);
    expect(r.guides).toHaveLength(0);
  });

  it("ignores neighbours that don't overlap the dragged row", () => {
    const r = distributionSnap(box(44, 0, 54, 10), neighbours, 3); // different y band
    expect(r.dx).toBe(0);
    expect(r.guides).toHaveLength(0);
  });

  it("works on the vertical axis too", () => {
    const col: BBox[] = [box(40, 10, 50, 20), box(40, 80, 50, 90)];
    const r = distributionSnap(box(40, 44, 50, 54), col, 3); // gapA 24, gapB 26 → +1
    expect(r.dy).toBeCloseTo(1, 6);
    expect(r.guides[0].axis).toBe("y");
  });
});

describe("snapBoxes", () => {
  it("returns the bounds of visible, non-excluded objects", () => {
    const d = doc([rect("a", 0, 0), rect("b", 50, 50)]);
    expect(snapBoxes(d, ["a"])).toEqual([{ minX: 50, minY: 50, maxX: 60, maxY: 60 }]);
  });
});

describe("selectionBox", () => {
  it("unions the bounds of the selected objects", () => {
    const d = doc([rect("a", 0, 0), rect("b", 90, 90)]);
    const b = selectionBox(d, ["a", "b"]);
    expect(b).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
  });

  it("returns null for an empty selection", () => {
    expect(selectionBox(doc(), [])).toBeNull();
  });
});
