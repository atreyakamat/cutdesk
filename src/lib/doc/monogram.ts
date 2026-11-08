/** Frame geometry for a monogram — a shape enclosing the text with padding. */
import type { Geometry } from "./types";

export type FrameKind = "none" | "circle" | "diamond";

export interface MonogramFrame {
  geo: Geometry;
  /** Offset of the frame object from the text's top-left, in mm. */
  dx: number;
  dy: number;
}

export function monogramFrame(kind: FrameKind, w: number, h: number, pad: number): MonogramFrame | null {
  if (kind === "none" || !(w > 0) || !(h > 0)) return null;
  const fw = w + pad * 2;
  const fh = h + pad * 2;
  if (kind === "circle") {
    // Ellipse origin is its centre: the text's centre sits at (w/2, h/2) from its top-left.
    return { geo: { kind: "ellipse", rx: fw / 2, ry: fh / 2 }, dx: w / 2, dy: h / 2 };
  }
  const f = (v: number) => Number(v.toFixed(2));
  const d = `M${f(fw / 2)} 0L${f(fw)} ${f(fh / 2)}L${f(fw / 2)} ${f(fh)}L0 ${f(fh / 2)}Z`;
  return { geo: { kind: "path", d }, dx: -pad, dy: -pad };
}
