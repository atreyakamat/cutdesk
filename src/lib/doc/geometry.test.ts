import { describe, expect, it } from "vitest";
import {
  applyCanvasTransform,
  flipHorizontal,
  flipVertical,
  matrixOf,
  moveObjectTo,
  resizeObjectTo,
  worldAABB,
  wrapDegrees,
} from "./geometry";
import { transformPoint } from "./pathData";
import type { DesignObject } from "./types";

function rect(over: Partial<DesignObject> = {}, w = 40, h = 20): DesignObject {
  return {
    id: "r",
    name: "Rect",
    layerId: "l",
    x: 10,
    y: 10,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    geo: { kind: "rect", width: w, height: h, cornerRadius: 0 },
    ...over,
  };
}

function ellipse(over: Partial<DesignObject> = {}): DesignObject {
  return {
    id: "e",
    name: "Ellipse",
    layerId: "l",
    x: 50,
    y: 50,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    geo: { kind: "ellipse", rx: 10, ry: 5 },
    ...over,
  };
}

describe("matrixOf", () => {
  it("rotates clockwise on a y-down canvas, then translates", () => {
    const p = transformPoint(matrixOf({ x: 5, y: 5, rotation: 90, scaleX: 1, scaleY: 1 }), 10, 0);
    expect(p.x).toBeCloseTo(5, 6);
    expect(p.y).toBeCloseTo(15, 6);
  });

  it("scales before rotating", () => {
    const p = transformPoint(matrixOf({ x: 0, y: 0, rotation: 90, scaleX: 2, scaleY: 1 }), 10, 0);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(20, 6);
  });
});

describe("worldAABB", () => {
  it("returns plain bounds for an unrotated rectangle", () => {
    expect(worldAABB(rect())).toEqual({ minX: 10, minY: 10, maxX: 50, maxY: 30 });
  });

  it("swaps width and height after a quarter turn", () => {
    const b = worldAABB(rect({ rotation: 90 }));
    expect(b.maxX - b.minX).toBeCloseTo(20, 6);
    expect(b.maxY - b.minY).toBeCloseTo(40, 6);
  });

  it("treats an ellipse origin as its centre", () => {
    const b = worldAABB(ellipse());
    expect(b.minX).toBeCloseTo(40, 3);
    expect(b.maxX).toBeCloseTo(60, 3);
    expect(b.minY).toBeCloseTo(45, 3);
    expect(b.maxY).toBeCloseTo(55, 3);
  });

  it("bounds text and path objects from their data", () => {
    const text: DesignObject = {
      ...rect(),
      geo: { kind: "text", text: "A", fontId: "lilita", size: 10, letterSpacing: 0, d: "M0 0L8 0L8 12Z", width: 8, height: 12 },
    };
    expect(worldAABB(text)).toEqual({ minX: 10, minY: 10, maxX: 18, maxY: 22 });
  });
});

describe("moving and resizing", () => {
  it("moves bounds to an absolute position", () => {
    const moved = moveObjectTo(ellipse(), 0, 0);
    const b = worldAABB(moved);
    expect(b.minX).toBeCloseTo(0, 3);
    expect(b.minY).toBeCloseTo(0, 3);
  });

  it("bakes resizes of rectangles into width and height", () => {
    const r = resizeObjectTo(rect(), { width: 80 }, false);
    expect(r.geo).toMatchObject({ kind: "rect", width: 80, height: 20 });
    expect(r.scaleX).toBe(1);
    expect(worldAABB(r).minX).toBe(10);
  });

  it("keeps the aspect ratio when asked", () => {
    const r = resizeObjectTo(rect(), { width: 80 }, true);
    expect(r.geo).toMatchObject({ width: 80, height: 40 });
  });

  it("resizes a quarter-turned rectangle along its rotated axes", () => {
    const r = resizeObjectTo(rect({ rotation: 90 }), { width: 40 }, false);
    // World width 20 → 40 means the local height doubles.
    expect(r.geo).toMatchObject({ width: 40, height: 40 });
  });

  it("keeps the top-left of the bounds fixed when resizing an ellipse", () => {
    const before = worldAABB(ellipse());
    const after = worldAABB(resizeObjectTo(ellipse(), { width: 40 }, false));
    expect(after.minX).toBeCloseTo(before.minX, 3);
    expect(after.maxX - after.minX).toBeCloseTo(40, 3);
  });

  it("scales path objects through the transform", () => {
    const path: DesignObject = { ...rect(), geo: { kind: "path", d: "M0 0L10 0L10 10Z" } };
    const r = resizeObjectTo(path, { width: 30 }, true);
    expect(r.scaleX).toBeCloseTo(3, 6);
    expect(r.scaleY).toBeCloseTo(3, 6);
  });
});

describe("flipping", () => {
  it("mirrors an object inside the same bounds", () => {
    const before = worldAABB(rect({ rotation: 30 }));
    const after = worldAABB(flipHorizontal(rect({ rotation: 30 })));
    expect(after.minX).toBeCloseTo(before.minX, 6);
    expect(after.maxX).toBeCloseTo(before.maxX, 6);
    expect(after.minY).toBeCloseTo(before.minY, 6);
  });

  it("maps a world point to its mirror image", () => {
    const o = rect({ rotation: 25 });
    const c = { x: (worldAABB(o).minX + worldAABB(o).maxX) / 2, y: (worldAABB(o).minY + worldAABB(o).maxY) / 2 };
    const p = transformPoint(matrixOf(o), 7, 3);
    const flipped = transformPoint(matrixOf(flipHorizontal(o)), 7, 3);
    expect(flipped.x).toBeCloseTo(2 * c.x - p.x, 6);
    expect(flipped.y).toBeCloseTo(p.y, 6);
  });

  it("flips vertically the same way", () => {
    const o = rect({ rotation: 25 });
    const box = worldAABB(o);
    const cy = (box.minY + box.maxY) / 2;
    const p = transformPoint(matrixOf(o), 7, 3);
    const flipped = transformPoint(matrixOf(flipVertical(o)), 7, 3);
    expect(flipped.x).toBeCloseTo(p.x, 6);
    expect(flipped.y).toBeCloseTo(2 * cy - p.y, 6);
  });

  it("is its own inverse", () => {
    const o = rect({ rotation: 25 });
    const twice = flipHorizontal(flipHorizontal(o));
    expect(twice.x).toBeCloseTo(o.x, 6);
    expect(twice.rotation).toBeCloseTo(o.rotation, 6);
    expect(twice.scaleX).toBe(o.scaleX);
  });
});

describe("applyCanvasTransform", () => {
  it("bakes scale into rectangle size and keeps flips as a sign", () => {
    const r = applyCanvasTransform(rect(), { x: 1, y: 2, rotation: 0, scaleX: -2, scaleY: 3 });
    expect(r.geo).toMatchObject({ width: 80, height: 60 });
    expect(r.scaleX).toBe(-1);
    expect(r.scaleY).toBe(1);
    expect(r.x).toBe(1);
  });

  it("keeps scale on paths", () => {
    const path: DesignObject = { ...rect(), geo: { kind: "path", d: "M0 0L1 1" } };
    const r = applyCanvasTransform(path, { x: 0, y: 0, rotation: 190, scaleX: 2, scaleY: 2 });
    expect(r.scaleX).toBe(2);
    expect(r.rotation).toBe(-170);
  });

  it("wraps degrees into (-180, 180]", () => {
    expect(wrapDegrees(270)).toBe(-90);
    expect(wrapDegrees(-190)).toBe(170);
    expect(wrapDegrees(180)).toBe(180);
  });
});
