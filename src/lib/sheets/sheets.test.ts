import { describe, expect, it } from "vitest";
import { dilate, emptyMask, nest, setCell } from "./nest";
import { A4_TEMPLATE, blankSheet, CELL_IN, crc32, DEFAULT_SPEC, designBox, gapCells, inPrintArea, SHEET_PX, specProblem, withDpi } from "./sheetLayout";

describe("Cricut sheets", () => {
  const square = (sideIn: number) => {
    const n = Math.ceil(sideIn / CELL_IN);
    const m = emptyMask(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) setCell(m, x, y);
    return m;
  };
  /** An L: a square with its top-right quarter missing, so turning it matters. */
  const ell = (sideIn: number, quarterTurns: number) => {
    const n = Math.ceil(sideIn / CELL_IN);
    const m = emptyMask(n, n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        // Rotate the "missing" quarter around the square.
        const [u, v] = [[x, y], [y, n - 1 - x], [n - 1 - x, n - 1 - y], [n - 1 - y, x]][quarterTurns];
        if (!(u >= n / 2 && v < n / 2)) setCell(m, x, y);
      }
    return m;
  };

  it("uses the A4 Print Then Cut template: 7.2 × 10.62 in with stepped corners", () => {
    expect(SHEET_PX).toEqual({ w: 2160, h: 3186 });
    expect(inPrintArea(3.6, 5.3)).toBe(true);
    expect(inPrintArea(0.1, 0.1)).toBe(false); // corner mark
    expect(inPrintArea(1, 0.2)).toBe(false); // inside the long step
    expect(inPrintArea(0.2, 1)).toBe(false);
    expect(inPrintArea(1.3, 0.1)).toBe(true); // past the long step
    expect(inPrintArea(0.4, 0.4)).toBe(true); // inside the L
    expect(inPrintArea(7.1, 10.5)).toBe(false);
    const g = blankSheet();
    expect(g.fits(square(0.3), 0, 0)).toBe(false);
    expect(g.fits(square(0.3), Math.round(1.28 / CELL_IN), 0)).toBe(true);
    expect(g.fits(square(0.3), Math.round(0.34 / CELL_IN), Math.round(0.34 / CELL_IN))).toBe(true);
  });

  it("packs 5 cm stickers with a 3 mm gap, never overlapping, and spills onto more sheets", () => {
    const pad = gapCells(0.3 / 2.54);
    const shape = square(5 / 2.54);
    const r = nest([{ key: "a", qty: 30, variants: [{ angle: 0, shape, clearance: dilate(shape, pad), pad }] }], blankSheet);
    // 3 across × 4 down, plus one more in a 5th row between the corner marks.
    expect(r.sheets.map((s) => s.length)).toEqual([13, 13, 4]);
    // Replay the placements on fresh sheets: every sticker lands on free, printable cells.
    for (const s of r.sheets) {
      const g = blankSheet();
      for (const p of s) {
        expect(g.fits(shape, p.x, p.y)).toBe(true);
        g.place(shape, p.x, p.y);
      }
      // And keeps the gap from each other.
      for (const [i, p] of s.entries())
        for (const q of s.slice(i + 1)) {
          const apart = Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) - shape.w;
          expect(apart).toBeGreaterThanOrEqual(pad);
        }
    }
  });

  it("turns shapes so they interlock and fit more", () => {
    const pad = gapCells(0.1);
    const variant = (q: number) => {
      const shape = ell(1.5, q);
      return { angle: q * 90, shape, clearance: dilate(shape, pad), pad };
    };
    const still = nest([{ key: "l", qty: 200, variants: [variant(0)] }], blankSheet).sheets[0].length;
    const turned = nest([{ key: "l", qty: 200, variants: [0, 1, 2, 3].map(variant) }], blankSheet).sheets[0].length;
    expect(turned).toBeGreaterThan(still);
  });

  it("keeps each design's shape and refuses stickers bigger than the sheet", () => {
    expect(designBox(2, 2)).toEqual({ w: 600, h: 300 });
    expect(designBox(0.5, 2)).toEqual({ w: 300, h: 600 });
    expect(specProblem({ ...DEFAULT_SPEC, sizeIn: 12 })).toMatch(/don't fit/);
    expect(specProblem(DEFAULT_SPEC)).toBeNull();
    const huge = square(A4_TEMPLATE.widthIn + 1);
    expect(nest([{ key: "x", qty: 1, variants: [{ angle: 0, shape: huge, clearance: huge, pad: 0 }] }], blankSheet).tooBig).toEqual(["x"]);
  });

  it("stamps 300 DPI into the PNG", () => {
    // Smallest valid PNG: signature, IHDR, IDAT, IEND.
    const png = Uint8Array.from(
      Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c489" + "0000000d49444154789c6360000002000154a24f5d" + "0000000049454e44ae426082", "hex"),
    );
    const out = withDpi(png, 300);
    const hex = Buffer.from(out).toString("hex");
    const at = hex.indexOf("70485973"); // pHYs
    expect(at).toBeGreaterThan(0);
    expect(hex.slice(at + 8, at + 26)).toBe("00002e2300002e2301"); // 11811 px/m both ways, unit metre
    expect(crc32(new TextEncoder().encode("IEND"))).toBe(0xae426082);
    expect(withDpi(out, 300)).toHaveLength(out.length); // replaces, never stacks
  });
});

