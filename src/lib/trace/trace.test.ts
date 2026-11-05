import { readFileSync } from "node:fs";
import { parse } from "opentype.js";
import { describe, expect, it } from "vitest";
import { flattenSegs, parsePath, polylineLength, segsBBox } from "../doc/pathData";
import { textOutline } from "../text/fonts";
import { buildMask, dilate, fillHoles, hasTransparency, padMask, smoothMask, type RawImage } from "./mask";
import { TraceError, extractBlackPaths, traceImage, type TraceOptions } from "./trace";

/** RGBA image with a filled circle (optionally with a hole) on a transparent or white background. */
function disc(size: number, radius: number, opts: { hole?: number; transparent?: boolean } = {}): RawImage {
  const data = new Uint8ClampedArray(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - c, y - c);
      const solid = dist <= radius && !(opts.hole && dist <= opts.hole);
      const i = (y * size + x) * 4;
      if (solid) {
        data.set([20, 20, 20, 255], i);
      } else if (opts.transparent) {
        data.set([0, 0, 0, 0], i);
      } else {
        data.set([255, 255, 255, 255], i);
      }
    }
  }
  return { width: size, height: size, data };
}

const baseOptions: TraceOptions = {
  mode: "outline",
  source: "auto",
  threshold: 128,
  invert: false,
  offsetMm: 0,
  fillHoles: true,
  smoothing: 2,
  widthMm: 80,
};

describe("mask helpers", () => {
  it("detects transparency", () => {
    expect(hasTransparency(disc(20, 6, { transparent: true }))).toBe(true);
    expect(hasTransparency(disc(20, 6))).toBe(false);
  });

  it("builds a mask from alpha when the image is transparent", () => {
    const mask = buildMask(disc(21, 6, { transparent: true }), { source: "auto", threshold: 128, invert: false });
    expect(mask[10 * 21 + 10]).toBe(1);
    expect(mask[0]).toBe(0);
  });

  it("builds a mask from darkness on opaque images and can invert it", () => {
    const img = disc(21, 6);
    const dark = buildMask(img, { source: "auto", threshold: 128, invert: false });
    const inverted = buildMask(img, { source: "auto", threshold: 128, invert: true });
    expect(dark[10 * 21 + 10]).toBe(1);
    expect(dark[0]).toBe(0);
    expect(inverted[10 * 21 + 10]).toBe(0);
    expect(inverted[0]).toBe(1);
  });

  it("fills interior holes but not notches open to the border", () => {
    const size = 21;
    const ring = buildMask(disc(size, 8, { hole: 3, transparent: true }), { source: "alpha", threshold: 0, invert: false });
    expect(ring[10 * size + 10]).toBe(0);
    expect(fillHoles(ring, size, size)[10 * size + 10]).toBe(1);

    const c = new Uint8Array(size * size);
    for (let y = 5; y < 16; y++) for (let x = 5; x < 16; x++) c[y * size + x] = 1;
    for (let x = 8; x < 16; x++) for (let y = 9; y < 12; y++) c[y * size + x] = 0; // slot open on the right
    expect(fillHoles(c, size, size)[10 * size + 12]).toBe(0);
  });

  it("dilates by an exact radius", () => {
    const size = 41;
    const mask = new Uint8Array(size * size);
    mask[20 * size + 20] = 1;
    const grown = dilate(mask, size, size, 5);
    expect(grown[20 * size + 25]).toBe(1);
    expect(grown[20 * size + 26]).toBe(0);
    expect(grown[25 * size + 20]).toBe(1);
    // Round, not square: the corner of the 11×11 box stays empty.
    expect(grown[25 * size + 25]).toBe(0);
  });

  it("leaves the mask alone for a zero radius", () => {
    const mask = new Uint8Array([0, 1, 0, 0]);
    expect(Array.from(dilate(mask, 2, 2, 0))).toEqual([0, 1, 0, 0]);
  });

  it("pads without moving pixels", () => {
    const padded = padMask(new Uint8Array([1, 1, 1, 1]), 2, 2, 3);
    expect(padded.width).toBe(8);
    expect(padded.mask[3 * 8 + 3]).toBe(1);
    expect(padded.mask[0]).toBe(0);
  });

  it("removes single-pixel specks when smoothing", () => {
    const size = 31;
    const mask = new Uint8Array(size * size);
    for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) mask[y * size + x] = 1;
    mask[2 * size + 2] = 1;
    const smooth = smoothMask(mask, size, size, 2);
    expect(smooth[2 * size + 2]).toBe(0);
    expect(smooth[16 * size + 16]).toBe(1);
  });
});

describe("traceImage", () => {
  it("extracts only dark fills from ImageTracer output", () => {
    const svg =
      '<svg><path fill="rgb(255,255,255)" d="M 0 0 L 9 9 Z"/><path fill="rgb(0,0,0)" stroke="x" d="M 1 1 L 5 1 L 5 5 Z"/></svg>';
    expect(extractBlackPaths(svg)).toBe("M 1 1 L 5 1 L 5 5 Z");
  });

  it("traces a disc to a closed outline of about the right size", () => {
    const result = traceImage(disc(100, 30, { transparent: true }), baseOptions);
    expect(result.d.startsWith("M")).toBe(true);
    expect(result.pathWidth).toBeGreaterThan(55);
    expect(result.pathWidth).toBeLessThan(65);
    const lines = flattenSegs(parsePath(result.d));
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(polylineLength(lines[0])).toBeGreaterThan(2 * Math.PI * 28);
    const box = segsBBox(parsePath(result.d))!;
    expect(box.minX).toBeCloseTo(0, 3);
    expect(box.minY).toBeCloseTo(0, 3);
  });

  it("grows the outline by the requested offset", () => {
    const img = disc(100, 30, { transparent: true });
    const flat = traceImage(img, { ...baseOptions, offsetMm: 0 });
    const grown = traceImage(img, { ...baseOptions, offsetMm: 4 });
    // 80 mm across 100 px → 0.8 mm/px; a 4 mm offset is 5 px per side.
    expect(grown.pathWidth - flat.pathWidth).toBeGreaterThan(8);
    expect(grown.pathWidth - flat.pathWidth).toBeLessThan(12);
    expect(grown.mmPerPx).toBeCloseTo(0.8, 6);
    expect(grown.pad).toBeGreaterThanOrEqual(5);
  });

  it("keeps hole contours in shapes mode and drops them when filling holes", () => {
    const img = disc(100, 34, { hole: 14, transparent: true });
    const shapes = traceImage(img, { ...baseOptions, mode: "shapes" });
    const outline = traceImage(img, { ...baseOptions, mode: "outline", fillHoles: true });
    const count = (d: string) => (d.match(/M/g) ?? []).length;
    expect(count(shapes.d)).toBeGreaterThanOrEqual(2);
    expect(count(outline.d)).toBe(1);
  });

  it("explains an empty result", () => {
    const blank: RawImage = { width: 10, height: 10, data: new Uint8ClampedArray(400).fill(255) };
    expect(() => traceImage(blank, baseOptions)).toThrow(TraceError);
    expect(() => traceImage(blank, baseOptions)).toThrow(/No artwork found/);
  });
});

describe("textOutline", () => {
  const buf = readFileSync("public/fonts/lilita-one-latin-400-normal.woff");
  const font = parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

  it("makes outlines whose bounds start at the origin", () => {
    const o = textOutline(font, "Hi", 20, 0);
    expect(o.d.length).toBeGreaterThan(20);
    expect(o.width).toBeGreaterThan(10);
    expect(o.height).toBeGreaterThan(10);
    const box = segsBBox(parsePath(o.d))!;
    expect(box.minX).toBeCloseTo(0, 2);
    expect(box.minY).toBeCloseTo(0, 2);
  });

  it("scales with font size", () => {
    const small = textOutline(font, "Hi", 10, 0);
    const large = textOutline(font, "Hi", 20, 0);
    expect(large.width / small.width).toBeCloseTo(2, 1);
  });

  it("widens with letter spacing", () => {
    const tight = textOutline(font, "Hello", 20, 0);
    const loose = textOutline(font, "Hello", 20, 3);
    expect(loose.width).toBeGreaterThan(tight.width + 8);
  });

  it("stacks lines", () => {
    const one = textOutline(font, "Hi", 20, 0);
    const two = textOutline(font, "Hi\nHi", 20, 0);
    expect(two.height).toBeGreaterThan(one.height * 1.7);
  });

  it("returns nothing for blank text", () => {
    expect(textOutline(font, "  \n ", 20, 0)).toEqual({ d: "", width: 0, height: 0 });
  });

  // Regression: opentype.js 2.0's Path.toPathData() returned NaN for "Hello" in Lilita One.
  it.each([
    "lilita-one-latin-400-normal",
    "pacifico-latin-400-normal",
    "bricolage-grotesque-latin-700-normal",
    "hanken-grotesk-latin-700-normal",
  ])("never produces non-finite numbers or open contours (%s)", (file) => {
    const b = readFileSync(`public/fonts/${file}.woff`);
    const f = parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    for (const text of ["Hello", "Hello world", "Sticker Shop 2026!", "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz"]) {
      for (const spacing of [0, 2]) {
        const o = textOutline(f, text, 20, spacing);
        expect(o.d, `${file} "${text}" spacing ${spacing}`).not.toMatch(/NaN|Infinity/);
        expect(o.width).toBeGreaterThan(0);
        const subpaths = (o.d.match(/M/g) ?? []).length;
        const closes = (o.d.match(/Z/g) ?? []).length;
        expect(closes).toBe(subpaths);
      }
    }
  });
});
