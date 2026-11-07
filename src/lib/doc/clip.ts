/**
 * Polygon offset and boolean operations, on rings in millimetres.
 *
 * Built on clipper-lib (integer geometry), so coordinates are scaled by SCALE
 * going in and divided coming out. A "ring" is a closed polygon as a list of
 * points; a shape is a list of rings (outer + holes). All functions are pure.
 */

import ClipperLib, { type Paths } from "clipper-lib";
import type { BBox, Point } from "./types";

const SCALE = 1000;

export type Ring = Point[];
export type BooleanOp = "union" | "difference" | "intersection" | "xor";

function toClipper(rings: readonly Ring[]): Paths {
  const out: Paths = [];
  for (const r of rings) {
    // Drop degenerate rings and any ring with a non-finite point (clipper would
    // otherwise ingest NaN/Infinity and produce garbage).
    if (r.length < 3 || r.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue;
    out.push(r.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) })));
  }
  return out;
}

function fromClipper(paths: Paths): Ring[] {
  return paths.filter((p) => p.length >= 3).map((p) => p.map((pt) => ({ x: pt.X / SCALE, y: pt.Y / SCALE })));
}

export function ringsBBox(rings: readonly Ring[]): BBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rings) {
    for (const p of r) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** Offset (inflate if delta>0, deflate if <0) a shape. Round joins for smooth borders. */
export function offsetRings(rings: readonly Ring[], deltaMm: number): Ring[] {
  const subject = toClipper(rings);
  if (subject.length === 0 || !Number.isFinite(deltaMm)) return [];
  const co = new ClipperLib.ClipperOffset(2, 0.25 * SCALE);
  co.AddPaths(subject, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const solution: Paths = [];
  co.Execute(solution, deltaMm * SCALE);
  return fromClipper(solution);
}

const CLIP_TYPE: Record<BooleanOp, number> = {
  union: ClipperLib.ClipType.ctUnion,
  difference: ClipperLib.ClipType.ctDifference,
  intersection: ClipperLib.ClipType.ctIntersection,
  xor: ClipperLib.ClipType.ctXor,
};

export function booleanRings(subjectRings: readonly Ring[], clipRings: readonly Ring[], op: BooleanOp): Ring[] {
  const subject = toClipper(subjectRings);
  const clip = toClipper(clipRings);
  if (subject.length === 0) return [];
  const clipper = new ClipperLib.Clipper();
  clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
  if (clip.length > 0) clipper.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
  const solution: Paths = [];
  clipper.Execute(CLIP_TYPE[op], solution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return fromClipper(solution);
}

/** SVG path data for a set of rings, each closed. */
export function ringsToPathData(rings: readonly Ring[], decimals = 3): string {
  const n = (v: number) => String(Number(v.toFixed(decimals)));
  return rings
    .map((r) => `M${n(r[0].x)} ${n(r[0].y)}` + r.slice(1).map((p) => `L${n(p.x)} ${n(p.y)}`).join("") + "Z")
    .join(" ");
}
