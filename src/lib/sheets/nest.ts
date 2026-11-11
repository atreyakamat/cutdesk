// Packs sticker shapes onto Cricut sheets without overlaps. Each sticker
// is a bitmap of the cells it covers (its real outline, not its box), tried
// at several angles, and dropped at the first free spot from the top left.
// Pure code (no canvas) so it can be tested and run anywhere.
//
// Bit layout: a row is a Uint32Array; cell x lives in word x >> 5, bit x & 31.

export type Mask = { w: number; h: number; rows: Uint32Array[]; area: number };

const words = (w: number) => (w >> 5) + 1;

export function emptyMask(w: number, h: number): Mask {
  return { w, h, rows: Array.from({ length: h }, () => new Uint32Array(words(w))), area: 0 };
}

export function setCell(m: Mask, x: number, y: number) {
  const r = m.rows[y];
  const bit = 1 << (x & 31);
  if (!(r[x >> 5] & bit)) {
    r[x >> 5] |= bit;
    m.area++;
  }
}

export const hasCell = (m: Mask, x: number, y: number) => (m.rows[y][x >> 5] & (1 << (x & 31))) !== 0;

/**
 * A cell is part of the sticker if any pixel inside it is. RGBA pixels, as
 * from getImageData. Errs on the side of "covered", so shapes never touch.
 */
export function maskFromRgba(rgba: Uint8ClampedArray | Uint8Array, pxW: number, pxH: number, cellPx: number, alphaMin = 8): Mask {
  const m = emptyMask(Math.ceil(pxW / cellPx), Math.ceil(pxH / cellPx));
  for (let y = 0; y < pxH; y++) {
    const cy = Math.floor(y / cellPx);
    for (let x = 0; x < pxW; x++) {
      if (rgba[(y * pxW + x) * 4 + 3] > alphaMin) setCell(m, Math.floor(x / cellPx), cy);
    }
  }
  return m;
}

/** Grows a shape by r cells in every direction (a disc), for the gap between stickers. */
export function dilate(m: Mask, r: number): Mask {
  if (r <= 0) return m;
  const out = emptyMask(m.w + 2 * r, m.h + 2 * r);
  const offsets: [number, number][] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) offsets.push([dx, dy]);
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      if (!hasCell(m, x, y)) continue;
      // Only edge cells need spreading; inner ones are covered by neighbours.
      const edge = x === 0 || y === 0 || x === m.w - 1 || y === m.h - 1 || !hasCell(m, x - 1, y) || !hasCell(m, x + 1, y) || !hasCell(m, x, y - 1) || !hasCell(m, x, y + 1);
      if (!edge) {
        setCell(out, x + r, y + r);
        continue;
      }
      for (const [dx, dy] of offsets) setCell(out, x + r + dx, y + r + dy);
    }
  return out;
}

/** The free and used cells of one sheet. */
export class Sheet {
  readonly rows: Uint32Array[];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    // One spare word so shifted reads never fall off the end.
    this.rows = Array.from({ length: h }, () => new Uint32Array(words(w) + 1));
  }

  block(x: number, y: number) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.rows[y][x >> 5] |= 1 << (x & 31);
  }

  /** Whether the shape fits with its top-left cell at (x, y). */
  fits(m: Mask, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x + m.w > this.w || y + m.h > this.h) return false;
    const w0 = x >> 5;
    const s = x & 31;
    const n = words(m.w);
    for (let r = 0; r < m.h; r++) {
      const row = this.rows[y + r];
      const mr = m.rows[r];
      for (let k = 0; k < n; k++) {
        const bits = mr[k];
        if (!bits) continue;
        if (row[w0 + k] & (bits << s)) return false;
        if (s && row[w0 + k + 1] & (bits >>> (32 - s))) return false;
      }
    }
    return true;
  }

  place(m: Mask, x: number, y: number) {
    const w0 = x >> 5;
    const s = x & 31;
    const n = words(m.w);
    for (let r = 0; r < m.h; r++) {
      const row = this.rows[y + r];
      const mr = m.rows[r];
      for (let k = 0; k < n; k++) {
        const bits = mr[k];
        if (!bits) continue;
        row[w0 + k] |= bits << s;
        if (s) row[w0 + k + 1] |= bits >>> (32 - s);
      }
    }
  }

  // Cells only ever fill up, so a spot that didn't fit a shape never will.
  // Remembering where each shape's last scan got to makes the next copy of
  // the same sticker start there instead of at the top.
  private readonly scanned = new WeakMap<Mask, number>();

  /**
   * First free spot, scanning rows from the top and each row from the
   * left, as y * w + x. Stops early at `before` (a better spot is known).
   */
  firstFit(m: Mask, before = Infinity): { x: number; y: number } | null {
    const start = this.scanned.get(m) ?? 0;
    const last = (this.h - m.h) * this.w + (this.w - m.w);
    for (let i = start; i <= last && i < before; i++) {
      const y = Math.floor(i / this.w);
      const x = i - y * this.w;
      if (x + m.w > this.w) {
        i = (y + 1) * this.w - 1;
        continue;
      }
      if (this.fits(m, x, y)) {
        this.scanned.set(m, i);
        return { x, y };
      }
    }
    this.scanned.set(m, Math.max(start, Math.min(before, last + 1)));
    return null;
  }
}

/**
 * One way to lay a sticker down. `shape` is what it covers; `clearance` is
 * the shape grown by the gap, which must land on free cells. Both share a
 * top-left corner once clearance is offset by `pad` cells.
 */
export type Variant = { angle: number; shape: Mask; clearance: Mask; pad: number };
export type NestItem = { key: string; qty: number; variants: Variant[] };
export type NestPlacement = { key: string; angle: number; x: number; y: number };

/**
 * First-fit decreasing: biggest stickers first, each into the earliest sheet
 * where one of its angles fits, at the highest then leftmost free spot.
 * `newSheet` returns an empty sheet with its no-print corners blocked.
 */
export function nest(items: NestItem[], newSheet: () => Sheet): { sheets: NestPlacement[][]; tooBig: string[] } {
  const copies = items
    .filter((i) => i.qty > 0 && i.variants.length)
    .flatMap((i) => Array.from({ length: Math.floor(i.qty) }, () => i))
    .sort((a, b) => b.variants[0].shape.area - a.variants[0].shape.area);
  const grids: Sheet[] = [];
  const sheets: NestPlacement[][] = [];
  const tooBig = new Set<string>();

  // Bottom-left fill: the angle whose lowest edge ends up highest wins, then
  // the leftmost. A turn that pokes further down the sheet wastes the rows
  // under it, so this keeps rows tight.
  const tryOn = (g: Sheet, item: NestItem) => {
    let best: { v: Variant; x: number; y: number; score: number } | null = null;
    for (const v of item.variants) {
      const h = v.clearance.h;
      // A spot whose score can't beat the best so far isn't worth scanning to.
      const at = g.firstFit(v.clearance, best ? best.score - h * g.w : Infinity);
      if (!at) continue;
      const score = (at.y + h) * g.w + at.x;
      if (!best || score < best.score) best = { v, ...at, score };
    }
    return best;
  };

  for (const item of copies) {
    if (tooBig.has(item.key)) continue;
    let done = false;
    for (let i = 0; i < grids.length && !done; i++) {
      const hit = tryOn(grids[i], item);
      if (hit) {
        grids[i].place(hit.v.shape, hit.x + hit.v.pad, hit.y + hit.v.pad);
        sheets[i].push({ key: item.key, angle: hit.v.angle, x: hit.x + hit.v.pad, y: hit.y + hit.v.pad });
        done = true;
      }
    }
    if (done) continue;
    const g = newSheet();
    const hit = tryOn(g, item);
    if (!hit) {
      tooBig.add(item.key);
      continue;
    }
    g.place(hit.v.shape, hit.x + hit.v.pad, hit.y + hit.v.pad);
    grids.push(g);
    sheets.push([{ key: item.key, angle: hit.v.angle, x: hit.x + hit.v.pad, y: hit.y + hit.v.pad }]);
  }
  return { sheets, tooBig: [...tooBig] };
}
