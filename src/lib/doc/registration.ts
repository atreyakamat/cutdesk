/**
 * Print-then-cut registration marks.
 *
 * For a print-then-cut job you print the design on a home printer, then the
 * cutter traces the cut paths around the printed art. Registration marks give a
 * fixed reference so the two line up. We draw an L-bracket in three corners
 * (top-left, top-right, bottom-left) — three corners make the orientation
 * unambiguous — inset from the mat edge, in the same millimetre coordinate space
 * as the cut paths, so a printed sheet and the cut file already agree.
 */

import type { Mat } from "./types";

export interface RegMarkOptions {
  /** Distance from the mat edge to the outer corner of each mark, mm. */
  margin: number;
  /** Length of each arm of the L, mm. */
  size: number;
  /** Stroke thickness of the arms, mm. */
  thickness: number;
  /** Mark colour; a solid black reads most reliably for a sensor or by eye. */
  color: string;
}

export const DEFAULT_REG_MARKS: RegMarkOptions = {
  margin: 6,
  size: 12,
  thickness: 1.2,
  color: "#000000",
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The filled rectangles that make up the three corner L-brackets. */
export function registrationMarkRects(mat: Mat, options: Partial<RegMarkOptions> = {}): Rect[] {
  const { margin: m, size: s, thickness: t } = { ...DEFAULT_REG_MARKS, ...options };
  const W = mat.width;
  const H = mat.height;
  return [
    // Top-left
    { x: m, y: m, w: s, h: t },
    { x: m, y: m, w: t, h: s },
    // Top-right
    { x: W - m - s, y: m, w: s, h: t },
    { x: W - m - t, y: m, w: t, h: s },
    // Bottom-left
    { x: m, y: H - m - t, w: s, h: t },
    { x: m, y: H - m - s, w: t, h: s },
  ];
}

function n(v: number): string {
  const r = Number(v.toFixed(3));
  return String(Object.is(r, -0) ? 0 : r);
}

/** An SVG `<g>` of the registration marks, ready to splice into an export. */
export function registrationMarksSvg(mat: Mat, options: Partial<RegMarkOptions> = {}): string {
  const color = (options.color ?? DEFAULT_REG_MARKS.color);
  const rects = registrationMarkRects(mat, options)
    .map((r) => `    <rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}"/>`)
    .join("\n");
  return `  <g id="registration-marks" data-role="registration" fill="${color}" stroke="none">\n${rects}\n  </g>`;
}
