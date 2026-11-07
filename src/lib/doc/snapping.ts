/**
 * Smart snapping for dragging on the mat — the behaviour that makes the editor
 * feel like Canva. While an object (or a group) is dragged, its bounding box
 * edges and centre are compared against "snap lines" collected from every other
 * object and from the mat itself. When a line lands within a small tolerance the
 * drag is nudged onto it and an alignment guide is shown.
 *
 * Everything here is pure and works in millimetres (mat coordinates), so it is
 * cheap to unit-test and independent of Konva.
 */

import { bboxCenter, unionBBox, worldAABB } from "./geometry";
import type { BBox, Doc } from "./types";

export interface SnapLines {
  /** Candidate vertical lines to snap to (x coordinates, mm). */
  xs: number[];
  /** Candidate horizontal lines to snap to (y coordinates, mm). */
  ys: number[];
}

export interface SnapResult {
  /** Offset to add to the drag so a box line lands on a target, mm. */
  dx: number;
  dy: number;
  /** The guide coordinate that was snapped to, or null when nothing snapped. */
  guideX: number | null;
  guideY: number | null;
}

function dedupe(values: number[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (!out.some((u) => Math.abs(u - v) < 1e-4)) out.push(v);
  }
  return out;
}

/** The three interesting positions of a box on one axis: start, centre, end. */
function linesX(b: BBox): number[] {
  return [b.minX, (b.minX + b.maxX) / 2, b.maxX];
}
function linesY(b: BBox): number[] {
  return [b.minY, (b.minY + b.maxY) / 2, b.maxY];
}

/**
 * Collect snap lines from the mat and from every visible object not being
 * dragged. Locked and hidden layers still contribute lines — you can line up
 * against something you can't move.
 */
export function snapTargets(doc: Doc, excludeIds: Iterable<string>): SnapLines {
  const skip = new Set(excludeIds);
  const visible = new Set(doc.layers.filter((l) => l.visible).map((l) => l.id));
  const xs = [0, doc.mat.width / 2, doc.mat.width];
  const ys = [0, doc.mat.height / 2, doc.mat.height];
  for (const o of doc.objects) {
    if (skip.has(o.id) || !visible.has(o.layerId)) continue;
    const b = worldAABB(o);
    xs.push(...linesX(b));
    ys.push(...linesY(b));
  }
  return { xs: dedupe(xs), ys: dedupe(ys) };
}

/** Bounds of the dragged selection, or null if nothing is selected. */
export function selectionBox(doc: Doc, ids: Iterable<string>): BBox | null {
  const want = new Set(ids);
  const boxes = doc.objects.filter((o) => want.has(o.id)).map(worldAABB);
  return unionBBox(boxes);
}

function nearest(
  positions: number[],
  targets: number[],
  tolerance: number,
): { delta: number; guide: number } | null {
  let best: { delta: number; guide: number } | null = null;
  let bestDist = tolerance;
  for (const p of positions) {
    for (const t of targets) {
      const dist = Math.abs(t - p);
      if (dist <= bestDist) {
        bestDist = dist;
        best = { delta: t - p, guide: t };
      }
    }
  }
  return best;
}

/**
 * Given the dragged box at its current (already-moved) position, return the
 * extra offset that lands it on the nearest snap line within `tolerance`, plus
 * the guide coordinates to draw. Each axis snaps independently.
 */
export function computeSnap(box: BBox, lines: SnapLines, tolerance: number): SnapResult {
  const sx = nearest(linesX(box), lines.xs, tolerance);
  const sy = nearest(linesY(box), lines.ys, tolerance);
  return {
    dx: sx?.delta ?? 0,
    dy: sy?.delta ?? 0,
    guideX: sx?.guide ?? null,
    guideY: sy?.guide ?? null,
  };
}

/** Convenience for callers that have the centre handy (equal-spacing checks etc.). */
export function boxCenter(b: BBox) {
  return bboxCenter(b);
}

// ---------------------------------------------------------------------------
// Equal-spacing (distribution) snapping — the Canva "spread evenly" behaviour.
// ---------------------------------------------------------------------------

/** One drawn spacing hint: a span along `axis` at cross-position `at`, mm. */
export interface SpacingGuide {
  axis: "x" | "y";
  /** The equal gap, mm. */
  gap: number;
  /** The two (or more) equal spans to mark: [start, end] along the axis. */
  spans: { start: number; end: number; at: number }[];
}

export interface DistributionResult {
  dx: number;
  dy: number;
  guides: SpacingGuide[];
}

/** Collect the world bounds of every snappable object, for distribution checks. */
export function snapBoxes(doc: Doc, excludeIds: Iterable<string>): BBox[] {
  const skip = new Set(excludeIds);
  const visible = new Set(doc.layers.filter((l) => l.visible).map((l) => l.id));
  return doc.objects.filter((o) => !skip.has(o.id) && visible.has(o.layerId)).map(worldAABB);
}

function overlaps(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax && aMax > bMin;
}

/**
 * If the dragged `box` sits between a left/above neighbour and a right/below one
 * whose gaps are nearly equal, return the offset that equalises them plus the
 * spacing hints to draw. Each axis is handled independently.
 */
export function distributionSnap(box: BBox, boxes: readonly BBox[], tolerance: number): DistributionResult {
  let dx = 0;
  let dy = 0;
  const guides: SpacingGuide[] = [];

  // --- Horizontal: a neighbour to the left and one to the right, rows overlap.
  {
    const rowMates = boxes.filter((b) => overlaps(b.minY, b.maxY, box.minY, box.maxY));
    const left = rowMates.filter((b) => b.maxX <= box.minX + tolerance).sort((a, b) => b.maxX - a.maxX)[0];
    const right = rowMates.filter((b) => b.minX >= box.maxX - tolerance).sort((a, b) => a.minX - b.minX)[0];
    if (left && right) {
      const gapL = box.minX - left.maxX;
      const gapR = right.minX - box.maxX;
      if (Math.abs(gapR - gapL) <= tolerance && Math.min(gapL, gapR) > -tolerance) {
        const shift = (gapR - gapL) / 2;
        dx = shift;
        const gap = (gapL + gapR) / 2;
        const at =
          (Math.max(box.minY, left.minY, right.minY) + Math.min(box.maxY, left.maxY, right.maxY)) / 2;
        guides.push({
          axis: "x",
          gap,
          spans: [
            { start: left.maxX, end: box.minX + shift, at },
            { start: box.maxX + shift, end: right.minX, at },
          ],
        });
      }
    }
  }

  // --- Vertical: a neighbour above and one below, columns overlap.
  {
    const colMates = boxes.filter((b) => overlaps(b.minX, b.maxX, box.minX, box.maxX));
    const above = colMates.filter((b) => b.maxY <= box.minY + tolerance).sort((a, b) => b.maxY - a.maxY)[0];
    const below = colMates.filter((b) => b.minY >= box.maxY - tolerance).sort((a, b) => a.minY - b.minY)[0];
    if (above && below) {
      const gapA = box.minY - above.maxY;
      const gapB = below.minY - box.maxY;
      if (Math.abs(gapB - gapA) <= tolerance && Math.min(gapA, gapB) > -tolerance) {
        const shift = (gapB - gapA) / 2;
        dy = shift;
        const gap = (gapA + gapB) / 2;
        const at =
          (Math.max(box.minX, above.minX, below.minX) + Math.min(box.maxX, above.maxX, below.maxX)) / 2;
        guides.push({
          axis: "y",
          gap,
          spans: [
            { start: above.maxY, end: box.minY + shift, at },
            { start: box.maxY + shift, end: below.minY, at },
          ],
        });
      }
    }
  }

  return { dx, dy, guides };
}
