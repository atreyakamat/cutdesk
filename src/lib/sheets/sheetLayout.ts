// The Cricut A4 Print Then Cut template, and helpers to fill it.
//
// Design Space prints Print Then Cut images up to 7.2 × 10.62 in on A4. The
// corners are cut out in two steps where the printer puts its registration
// marks, so nothing may sit there (measured from the owner's template PNG at
// 300 DPI: 2161 × 3187 px). Design Space cuts around the outer edge of each
// separate shape in a transparent PNG, so the sheet is exported with no
// background and the stickers' own outlines become the cut lines.

import { Sheet } from "./nest";

export const A4_TEMPLATE = {
  widthIn: 7.2,
  heightIn: 10.62,
  /** Each corner is blocked for this long along one edge and this deep along the other, twice (an L in steps). */
  notchLongIn: 1.28,
  notchShortIn: 0.34,
} as const;

export const DPI = 300;
/** Nesting works on a grid of 0.02 in cells (6 px at 300 DPI). */
export const CELL_IN = 0.02;
export const CELL_PX = Math.round(CELL_IN * DPI);
export const SHEET_PX = { w: Math.round(A4_TEMPLATE.widthIn * DPI), h: Math.round(A4_TEMPLATE.heightIn * DPI) };
const SHEET_CELLS = { w: Math.round(A4_TEMPLATE.widthIn / CELL_IN), h: Math.round(A4_TEMPLATE.heightIn / CELL_IN) };

/** Whether a point (in inches from the top left) is inside the printable template. */
export function inPrintArea(x: number, y: number): boolean {
  const { widthIn: W, heightIn: H, notchLongIn: L, notchShortIn: S } = A4_TEMPLATE;
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  const dx = Math.min(x, W - x);
  const dy = Math.min(y, H - y);
  return !((dx < L && dy < S) || (dx < S && dy < L));
}

/** An empty sheet grid with the template's corners blocked. */
export function blankSheet(): Sheet {
  const g = new Sheet(SHEET_CELLS.w, SHEET_CELLS.h);
  const L = Math.round(A4_TEMPLATE.notchLongIn / CELL_IN);
  const S = Math.round(A4_TEMPLATE.notchShortIn / CELL_IN);
  for (let y = 0; y < g.h; y++) {
    const dy = Math.min(y, g.h - 1 - y);
    for (let x = 0; x < g.w; x++) {
      const dx = Math.min(x, g.w - 1 - x);
      if ((dx < L && dy < S) || (dx < S && dy < L)) g.block(x, y);
    }
  }
  return g;
}

/** The template outline as an SVG path in inches, for the preview. */
export function templatePath(): string {
  const { widthIn: W, heightIn: H, notchLongIn: L, notchShortIn: S } = A4_TEMPLATE;
  return `M${L} 0H${W - L}V${S}H${W - S}V${L}H${W}V${H - L}H${W - S}V${H - S}H${W - L}V${H}H${L}V${H - S}H${S}V${H - L}H0V${L}H${S}V${S}H${L}Z`;
}

export type SheetSpec = {
  /** Longest side of each design, outline included, in inches. */
  sizeIn: number;
  /** Extra white outline to add around each design, in inches. 0 when the files already have one. */
  borderIn: number;
  /** Space between stickers, and from the edge, in inches. */
  gapIn: number;
  /** Turn stickers in steps of this many degrees to fit more. 0 = never turn. */
  angleStep: number;
};

export const DEFAULT_SPEC: SheetSpec = { sizeIn: 2, borderIn: 0, gapIn: 0.12, angleStep: 15 };

export const ANGLE_STEPS = [
  { step: 0, label: "Don't turn them" },
  { step: 90, label: "Quarter turns" },
  { step: 45, label: "Every 45°" },
  { step: 15, label: "Every 15° (fits the most)" },
] as const;

export const anglesFor = (step: number) => (step > 0 ? Array.from({ length: Math.floor(360 / step) }, (_, i) => i * step) : [0]);

/** Gap in grid cells, rounded up so stickers are never closer than asked. */
export const gapCells = (gapIn: number) => Math.max(1, Math.ceil(gapIn / CELL_IN));

/** The design's size in pixels before turning: longest side = sizeIn, aspect kept. */
export function designBox(aspect: number, sizeIn: number) {
  const long = Math.round(sizeIn * DPI);
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  return a >= 1 ? { w: long, h: Math.max(1, Math.round(long / a)) } : { w: Math.max(1, Math.round(long * a)), h: long };
}

/** Why the settings can't work, or null. */
export function specProblem(spec: SheetSpec): string | null {
  if (!(spec.sizeIn > 0)) return "Set the sticker size.";
  if (spec.borderIn < 0 || spec.gapIn < 0) return "Outline and gap can't be negative.";
  const foot = spec.sizeIn + 2 * spec.borderIn + 2 * spec.gapIn;
  if (foot > A4_TEMPLATE.widthIn - 2 * A4_TEMPLATE.notchShortIn && foot > A4_TEMPLATE.heightIn - 2 * A4_TEMPLATE.notchLongIn)
    return "Stickers that size don't fit on the sheet. Make them smaller.";
  return null;
}

// PNG resolution ----------------------------------------------------------
// Canvas PNGs carry no DPI. A pHYs chunk lets apps that read it open the
// sheet at its real size. Not every app does, so the sheet maker also says
// which width to set after uploading.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Returns the PNG with a pHYs chunk for `dpi` right after IHDR (replacing any). */
export function withDpi(png: Uint8Array, dpi: number): Uint8Array {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (png.length < 33 || sig.some((v, i) => png[i] !== v)) throw new Error("Not a PNG");
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));

  // Copy every chunk except an existing pHYs, inserting ours after IHDR.
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  let off = 8;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  while (off + 12 <= png.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(...png.subarray(off + 4, off + 8));
    const end = off + 12 + len;
    if (type !== "pHYs") parts.push(png.subarray(off, end));
    if (type === "IHDR") parts.push(chunk);
    off = end;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
