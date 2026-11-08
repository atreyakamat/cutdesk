import { describe, expect, it } from "vitest";
import { buildCutPlan, innerFirstOrder } from "./cutPlan";
import type { BBox, Doc } from "./types";

const box = (minX: number, minY: number, maxX: number, maxY: number): BBox => ({ minX, minY, maxX, maxY });

describe("innerFirstOrder", () => {
  it("puts a contained box before the one containing it", () => {
    const items = [{ id: "outer", b: box(0, 0, 100, 100) }, { id: "inner", b: box(10, 10, 20, 20) }];
    expect(innerFirstOrder(items, (i) => i.b).map((i) => i.id)).toEqual(["inner", "outer"]);
  });

  it("is stable for unrelated boxes and handles deep nesting", () => {
    const items = [
      { id: "a", b: box(0, 0, 100, 100) }, // outer
      { id: "b", b: box(5, 5, 60, 60) }, // mid (inside a)
      { id: "c", b: box(10, 10, 20, 20) }, // inner (inside a and b)
      { id: "d", b: box(200, 0, 210, 10) }, // separate
    ];
    // Deepest first: c (depth 2), b (depth 1), then a and d (depth 0, original order).
    expect(innerFirstOrder(items, (i) => i.b).map((i) => i.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("doesn't reorder identical boxes (neither contains the other)", () => {
    const items = [{ id: "a", b: box(0, 0, 10, 10) }, { id: "b", b: box(0, 0, 10, 10) }];
    expect(innerFirstOrder(items, (i) => i.b).map((i) => i.id)).toEqual(["a", "b"]);
  });
});

function doc(objects: Doc["objects"]): Doc {
  return {
    name: "T",
    unit: "mm",
    mat: { preset: "custom", width: 300, height: 300 },
    layers: [{ id: "L", name: "Cut", operation: "cut", color: "#000", visible: true, locked: false }],
    objects,
  };
}
const rectObj = (id: string, x: number, y: number, s: number) => ({
  id,
  name: id,
  layerId: "L",
  geo: { kind: "rect" as const, width: s, height: s, cornerRadius: 0 },
  x,
  y,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
});

describe("buildCutPlan inner-before-outer", () => {
  it("cuts a contained shape before the outer shape", () => {
    // Big 100mm square with a small 10mm square inside it.
    const d = doc([rectObj("outer", 0, 0, 100), rectObj("inner", 20, 20, 10)]);
    const order = buildCutPlan(d).passes.map((p) => p.objectId);
    expect(order.indexOf("inner")).toBeLessThan(order.indexOf("outer"));
  });
});
