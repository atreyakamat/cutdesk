/**
 * Shelf packing (first-fit decreasing by height) to arrange shapes tightly on
 * the mat and save material. Pure: takes box sizes, returns target top-left
 * positions in millimetres. Boxes wider than the row simply get their own row.
 */

export interface NestItem {
  id: string;
  w: number;
  h: number;
}

export interface NestOptions {
  /** Usable mat width, mm. */
  width: number;
  /** Gap between boxes and between rows, mm. */
  gap: number;
  /** Inset from the mat edges, mm. */
  margin: number;
}

export function nestBoxes(items: readonly NestItem[], opts: NestOptions): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const avail = Math.max(0, opts.width - opts.margin * 2);
  // Tallest first keeps shelves tight.
  const order = [...items].filter((it) => Number.isFinite(it.w) && Number.isFinite(it.h)).sort((a, b) => b.h - a.h);

  let cx = opts.margin;
  let cy = opts.margin;
  let rowH = 0;
  for (const it of order) {
    const atRowStart = cx <= opts.margin + 1e-9;
    if (!atRowStart && cx - opts.margin + it.w > avail) {
      // Wrap to the next shelf.
      cx = opts.margin;
      cy += rowH + opts.gap;
      rowH = 0;
    }
    pos.set(it.id, { x: cx, y: cy });
    cx += it.w + opts.gap;
    rowH = Math.max(rowH, it.h);
  }
  return pos;
}
