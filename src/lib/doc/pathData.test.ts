import { describe, expect, it } from "vitest";
import {
  ellipseSegs,
  flattenSegs,
  normalizePath,
  parsePath,
  polylineLength,
  rectSegs,
  segsBBox,
  serializePath,
  transformSegs,
} from "./pathData";

describe("parsePath", () => {
  it("normalises relative and shorthand commands to absolute M/L/C/Q/Z", () => {
    const segs = parsePath("m10 10 h20 v20 l-20 0 z");
    expect(segs).toEqual([
      { t: "M", x: 10, y: 10 },
      { t: "L", x: 30, y: 10 },
      { t: "L", x: 30, y: 30 },
      { t: "L", x: 10, y: 30 },
      { t: "Z" },
    ]);
  });

  it("treats extra pairs after M as lineto", () => {
    expect(parsePath("M0 0 10 0 10 10")).toEqual([
      { t: "M", x: 0, y: 0 },
      { t: "L", x: 10, y: 0 },
      { t: "L", x: 10, y: 10 },
    ]);
  });

  it("reflects control points for S and T", () => {
    const [, c] = parsePath("M0 0 C0 10 10 10 10 0 S20 -10 20 0");
    expect(parsePath("M0 0 C0 10 10 10 10 0 S20 -10 20 0")[2]).toEqual({
      t: "C",
      x1: 10,
      y1: -10,
      x2: 20,
      y2: -10,
      x: 20,
      y: 0,
    });
    expect(c.t).toBe("C");
  });

  it("reads compact numbers like opentype.js writes them", () => {
    expect(parsePath("M23.76-27.12L23.76-0.68")).toEqual([
      { t: "M", x: 23.76, y: -27.12 },
      { t: "L", x: 23.76, y: -0.68 },
    ]);
  });

  it("rejects data that doesn't start with a command", () => {
    expect(() => parsePath("10 10 L 5 5")).toThrow();
  });
});

describe("serializePath", () => {
  it("round-trips and trims trailing zeros", () => {
    const d = "M0 0L10.5 0L10.5 2Z";
    expect(serializePath(parsePath(d))).toBe(d);
  });

  it("never writes negative zero", () => {
    expect(serializePath([{ t: "M", x: -0.0001, y: 0 }])).toBe("M0 0");
  });
});

describe("flatten, bbox and length", () => {
  it("measures a closed rectangle", () => {
    const [line] = flattenSegs(rectSegs(10, 5, 0));
    expect(line.closed).toBe(true);
    expect(polylineLength(line)).toBeCloseTo(30, 6);
    expect(segsBBox(rectSegs(10, 5, 0))).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 5 });
  });

  it("approximates the circumference of a circle", () => {
    const [line] = flattenSegs(ellipseSegs(10, 10), 64);
    expect(polylineLength(line)).toBeCloseTo(2 * Math.PI * 10, 1);
  });

  it("keeps rounded corners inside the rectangle bounds", () => {
    const box = segsBBox(rectSegs(40, 20, 6))!;
    expect(box.minX).toBeCloseTo(0, 6);
    expect(box.maxX).toBeCloseTo(40, 6);
    expect(box.maxY).toBeCloseTo(20, 6);
  });

  it("starts a new subpath after Z", () => {
    const lines = flattenSegs(parsePath("M0 0L5 0L5 5Z M10 10L15 10L15 15Z"));
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.closed)).toBe(true);
  });
});

describe("transforms", () => {
  it("applies an affine matrix to curve control points", () => {
    const [m, c] = transformSegs(parsePath("M0 0C0 10 10 10 10 0"), [2, 0, 0, 2, 5, 5]);
    expect(m).toEqual({ t: "M", x: 5, y: 5 });
    expect(c).toEqual({ t: "C", x1: 5, y1: 25, x2: 25, y2: 25, x: 25, y: 5 });
  });

  it("moves the bounding box to the origin when normalising", () => {
    const n = normalizePath("M10 20L30 20L30 50Z");
    expect(n.dx).toBe(10);
    expect(n.dy).toBe(20);
    expect(n.width).toBe(20);
    expect(n.height).toBe(30);
    expect(n.d).toBe("M0 0L20 0L20 30Z");
  });

  it("returns an empty result for empty path data", () => {
    expect(normalizePath("")).toEqual({ d: "", dx: 0, dy: 0, width: 0, height: 0 });
  });
});
