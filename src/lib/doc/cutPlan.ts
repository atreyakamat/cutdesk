import { polylineLength } from "./pathData";
import { worldAABB, worldPolylines } from "./geometry";
import type { BBox, Doc, Operation, Point } from "./types";

export interface Pass {
  objectId: string;
  operation: Exclude<Operation, "print">;
  points: Point[];
  closed: boolean;
  length: number;
  /** Distance travelled before this pass starts. */
  start: number;
}

export interface CutPlan {
  passes: Pass[];
  totalLength: number;
  lengthByOperation: Record<Exclude<Operation, "print">, number>;
}

const ORDER: readonly Exclude<Operation, "print">[] = ["draw", "score", "cut"];

const bboxArea = (b: BBox) => Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);

/** True if `outer` strictly contains `inner` (bounding-box test, with tolerance). */
function contains(outer: BBox, inner: BBox, eps = 0.01): boolean {
  return (
    bboxArea(outer) > bboxArea(inner) + 1e-6 &&
    inner.minX >= outer.minX - eps &&
    inner.minY >= outer.minY - eps &&
    inner.maxX <= outer.maxX + eps &&
    inner.maxY <= outer.maxY + eps
  );
}

/**
 * Reorder so a shape contained within others comes first (inner-before-outer),
 * which stops small cut-out pieces shifting once the outline is cut. Stable for
 * unrelated shapes; non-finite bounds just don't nest.
 */
export function innerFirstOrder<T>(items: readonly T[], box: (t: T) => BBox): T[] {
  const boxes = items.map(box);
  const depth = boxes.map((b, i) => boxes.reduce((n, ob, j) => n + (j !== i && contains(ob, b) ? 1 : 0), 0));
  return items
    .map((t, i) => ({ t, i }))
    .sort((a, b) => depth[b.i] - depth[a.i] || a.i - b.i)
    .map((x) => x.t);
}

/**
 * The sequence a machine would follow: draw first, then score, then cut, with
 * layer and object order preserved inside each operation. Reference artwork is
 * never part of the plan.
 */
export function buildCutPlan(doc: Doc): CutPlan {
  const layerIndex = new Map(doc.layers.map((l, i) => [l.id, i] as const));
  const layers = new Map(doc.layers.map((l) => [l.id, l] as const));

  const passes: Pass[] = [];
  const lengthByOperation = { draw: 0, score: 0, cut: 0 };
  let cursor = 0;

  for (const op of ORDER) {
    const objects = doc.objects
      .map((o, order) => ({ o, order }))
      .filter(({ o }) => {
        const layer = layers.get(o.layerId);
        return layer && layer.visible && !o.hidden && layer.operation === op;
      })
      .sort((a, b) => {
        const la = layerIndex.get(a.o.layerId) ?? 0;
        const lb = layerIndex.get(b.o.layerId) ?? 0;
        return la - lb || a.order - b.order;
      });

    // Cut (and score/draw) contained shapes before the shapes enclosing them.
    const ordered = innerFirstOrder(objects, ({ o }) => worldAABB(o));

    for (const { o } of ordered) {
      for (const line of worldPolylines(o)) {
        if (line.points.length < 2) continue;
        const length = polylineLength(line);
        if (length <= 0) continue;
        const points = line.closed ? [...line.points, line.points[0]] : line.points;
        passes.push({ objectId: o.id, operation: op, points, closed: line.closed, length, start: cursor });
        cursor += length;
        lengthByOperation[op] += length;
      }
    }
  }

  return { passes, totalLength: cursor, lengthByOperation };
}

/** Position of the blade after travelling `distance` along the plan. */
export function pointAtDistance(plan: CutPlan, distance: number): Point | null {
  if (plan.passes.length === 0) return null;
  const d = Math.max(0, Math.min(distance, plan.totalLength));
  // Linear scan is fine: called once per animation frame.
  let pass = plan.passes[0];
  for (const p of plan.passes) {
    if (p.start <= d) pass = p;
    else break;
  }
  let remaining = d - pass.start;
  const pts = pass.points;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (remaining <= seg || i === pts.length - 1) {
      const t = seg === 0 ? 0 : Math.min(1, remaining / seg);
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    remaining -= seg;
  }
  return pts[pts.length - 1];
}

/** Ids of cut, score or draw objects that reach outside the mat. */
export function objectsOutsideMat(doc: Doc): string[] {
  const mat: BBox = { minX: 0, minY: 0, maxX: doc.mat.width, maxY: doc.mat.height };
  const layers = new Map(doc.layers.map((l) => [l.id, l] as const));
  const eps = 0.01;
  return doc.objects
    .filter((o) => {
      const layer = layers.get(o.layerId);
      if (!layer || layer.operation === "print" || !layer.visible || o.hidden) return false;
      const box = worldAABB(o);
      const inside =
        box.minX >= mat.minX - eps && box.minY >= mat.minY - eps && box.maxX <= mat.maxX + eps && box.maxY <= mat.maxY + eps;
      return !inside;
    })
    .map((o) => o.id);
}
