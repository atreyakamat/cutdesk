import {
  ellipseSegs,
  flattenSegs,
  parsePath,
  pointsBBox,
  rectSegs,
  transformPoint,
  transformSegs,
  type Matrix,
  type Polyline,
  type Seg,
} from "./pathData";
import type { BBox, DesignObject, Geometry, Point, Transform } from "./types";

/** Matrix for translate(x, y) · rotate(r) · scale(sx, sy). */
export function matrixOf(t: Transform): Matrix {
  const r = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos * t.scaleX, sin * t.scaleX, -sin * t.scaleY, cos * t.scaleY, t.x, t.y];
}

/** Inverse of an affine matrix, or null when it isn't invertible. */
export function invertMatrix(m: Matrix): Matrix | null {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (!det || !Number.isFinite(det)) return null;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/** Local-space segments for any geometry that can be cut or drawn. */
export function geoSegs(geo: Geometry): Seg[] | null {
  switch (geo.kind) {
    case "rect":
      return rectSegs(geo.width, geo.height, geo.cornerRadius);
    case "ellipse":
      return ellipseSegs(geo.rx, geo.ry);
    case "path":
    case "text":
      return geo.d ? parsePath(geo.d) : [];
    case "image":
      return null;
  }
}

/** Corners of the local bounding box, used for images and empty paths. */
function localCorners(geo: Geometry): Point[] {
  switch (geo.kind) {
    case "rect":
    case "image":
      return [
        { x: 0, y: 0 },
        { x: geo.width, y: 0 },
        { x: geo.width, y: geo.height },
        { x: 0, y: geo.height },
      ];
    case "ellipse":
      return [
        { x: -geo.rx, y: -geo.ry },
        { x: geo.rx, y: -geo.ry },
        { x: geo.rx, y: geo.ry },
        { x: -geo.rx, y: geo.ry },
      ];
    case "text":
      return [
        { x: 0, y: 0 },
        { x: geo.width, y: 0 },
        { x: geo.width, y: geo.height },
        { x: 0, y: geo.height },
      ];
    case "path":
      return [];
  }
}

/** World-space polylines of everything an object would cut or draw. */
export function worldPolylines(obj: DesignObject): Polyline[] {
  const segs = geoSegs(obj.geo);
  if (!segs) return [];
  return flattenSegs(transformSegs(segs, matrixOf(obj)));
}

export function worldSegs(obj: DesignObject): Seg[] | null {
  const segs = geoSegs(obj.geo);
  return segs ? transformSegs(segs, matrixOf(obj)) : null;
}

/** Axis-aligned bounds of an object in mat coordinates. */
export function worldAABB(obj: DesignObject): BBox {
  const m = matrixOf(obj);
  const geo = obj.geo;
  let points: Point[];
  if (geo.kind === "path" || geo.kind === "text") {
    points = worldPolylines(obj).flatMap((l) => l.points);
    if (points.length === 0) points = localCorners(geo).map((c) => transformPoint(m, c.x, c.y));
  } else if (geo.kind === "ellipse" || geo.kind === "rect") {
    // Curves in a rotated rect/ellipse need flattening for tight bounds.
    points = worldPolylines(obj).flatMap((l) => l.points);
  } else {
    points = localCorners(geo).map((c) => transformPoint(m, c.x, c.y));
  }
  return pointsBBox(points) ?? { minX: obj.x, minY: obj.y, maxX: obj.x, maxY: obj.y };
}

export function unionBBox(boxes: readonly BBox[]): BBox | null {
  if (boxes.length === 0) return null;
  return boxes.reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }));
}

export function bboxesIntersect(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function bboxSize(b: BBox): { width: number; height: number } {
  return { width: b.maxX - b.minX, height: b.maxY - b.minY };
}

export function bboxCenter(b: BBox): Point {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

// ---------------------------------------------------------------------------
// Pure operations. Each returns a new object and never mutates its input.
// ---------------------------------------------------------------------------

export function translateObject(obj: DesignObject, dx: number, dy: number): DesignObject {
  return { ...obj, x: obj.x + dx, y: obj.y + dy };
}

/** Move an object so its bounds start at (x, y). Either coordinate may be omitted. */
export function moveObjectTo(obj: DesignObject, x?: number, y?: number): DesignObject {
  const box = worldAABB(obj);
  return translateObject(obj, x === undefined ? 0 : x - box.minX, y === undefined ? 0 : y - box.minY);
}

const MIN_SCALE = 1e-3;

/**
 * Scale along the object's own axes. Rectangles and ellipses bake the factor
 * into their size so corner radii and numbers stay meaningful; everything else
 * keeps it in the transform.
 */
export function scaleObjectLocal(obj: DesignObject, fx: number, fy: number): DesignObject {
  const geo = obj.geo;
  switch (geo.kind) {
    case "rect":
      return {
        ...obj,
        geo: {
          ...geo,
          width: Math.max(MIN_SCALE, geo.width * fx),
          height: Math.max(MIN_SCALE, geo.height * fy),
          cornerRadius: geo.cornerRadius * Math.min(fx, fy),
        },
      };
    case "ellipse":
      return {
        ...obj,
        geo: { ...geo, rx: Math.max(MIN_SCALE, geo.rx * fx), ry: Math.max(MIN_SCALE, geo.ry * fy) },
      };
    default:
      return { ...obj, scaleX: obj.scaleX * fx, scaleY: obj.scaleY * fy };
  }
}

function isQuarterTurn(rotation: number): boolean {
  const r = ((rotation % 180) + 180) % 180;
  return Math.abs(r) < 1e-6 || Math.abs(r - 90) < 1e-6 || Math.abs(r - 180) < 1e-6;
}

function isOddQuarterTurn(rotation: number): boolean {
  const r = ((rotation % 180) + 180) % 180;
  return Math.abs(r - 90) < 1e-6;
}

/**
 * Resize so the world-space bounds become width × height, keeping the
 * top-left corner of the bounds where it was. Works exactly for multiples of
 * 90°. At other angles the object scales uniformly, driven by whichever
 * dimension changed.
 */
export function resizeObjectTo(
  obj: DesignObject,
  size: { width?: number; height?: number },
  keepAspect: boolean,
): DesignObject {
  const before = worldAABB(obj);
  const cur = bboxSize(before);
  if (cur.width <= 0 && cur.height <= 0) return obj;

  let wf = size.width !== undefined && cur.width > 0 ? size.width / cur.width : 1;
  let hf = size.height !== undefined && cur.height > 0 ? size.height / cur.height : 1;

  if (keepAspect || !isQuarterTurn(obj.rotation)) {
    const uniform = size.width !== undefined && size.height === undefined ? wf : size.height !== undefined && size.width === undefined ? hf : wf;
    wf = uniform;
    hf = uniform;
  }

  // World width follows local X unless the object is turned a quarter.
  const [fx, fy] = isOddQuarterTurn(obj.rotation) ? [hf, wf] : [wf, hf];
  const scaled = scaleObjectLocal(obj, fx, fy);
  const after = worldAABB(scaled);
  return translateObject(scaled, before.minX - after.minX, before.minY - after.minY);
}

/** Mirror about the vertical centre line of the object's bounds. */
export function flipHorizontal(obj: DesignObject): DesignObject {
  const c = bboxCenter(worldAABB(obj));
  return { ...obj, x: 2 * c.x - obj.x, rotation: -obj.rotation, scaleX: -obj.scaleX };
}

/** Mirror about the horizontal centre line of the object's bounds. */
export function flipVertical(obj: DesignObject): DesignObject {
  const c = bboxCenter(worldAABB(obj));
  return { ...obj, y: 2 * c.y - obj.y, rotation: -obj.rotation, scaleY: -obj.scaleY };
}

/** Normalise a rotation to the range (-180, 180]. */
export function wrapDegrees(deg: number): number {
  let r = ((deg % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return r;
}

/**
 * Apply a transform reported by the canvas. Rectangles and ellipses bake the
 * scale into their size; flips are kept as a sign.
 */
export function applyCanvasTransform(obj: DesignObject, t: Transform): DesignObject {
  const base: DesignObject = { ...obj, x: t.x, y: t.y, rotation: wrapDegrees(t.rotation) };
  if (obj.geo.kind === "rect" || obj.geo.kind === "ellipse") {
    const sx = Math.abs(t.scaleX);
    const sy = Math.abs(t.scaleY);
    const baked = scaleObjectLocal({ ...base, scaleX: 1, scaleY: 1 }, sx, sy);
    return { ...baked, scaleX: Math.sign(t.scaleX) || 1, scaleY: Math.sign(t.scaleY) || 1 };
  }
  return { ...base, scaleX: t.scaleX, scaleY: t.scaleY };
}
