import type { BBox, Point } from "./types";

/**
 * Minimal SVG path engine. Everything is normalised to absolute M, L, C, Q
 * and Z segments, so transforming, flattening and measuring only need to
 * handle four cases.
 *
 * Arcs (A) are approximated by a straight line to their end point. CutDesk
 * never produces arcs itself; tracing and text outlines use curves only.
 */

export type Seg =
  | { t: "M"; x: number; y: number }
  | { t: "L"; x: number; y: number }
  | { t: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { t: "Q"; x1: number; y1: number; x: number; y: number }
  | { t: "Z" };

/** [a, b, c, d, e, f] — the same layout SVG and canvas use. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const ARG_COUNT: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

const TOKEN = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

export function parsePath(d: string): Seg[] {
  const tokens = d.match(TOKEN) ?? [];
  const segs: Seg[] = [];

  let i = 0;
  let cmd = "";
  // Explicit types: inference loops through the relative-offset logic below.
  let cx: number = 0;
  let cy: number = 0;
  let sx: number = 0;
  let sy: number = 0;
  // Last control point, for S and T reflection.
  let lastCubic: Point | null = null;
  let lastQuad: Point | null = null;

  const num = (): number => {
    const token = tokens[i++];
    const n = Number(token);
    if (token === undefined || Number.isNaN(n)) {
      throw new Error(`Invalid path data near "${token ?? "end"}"`);
    }
    return n;
  };

  while (i < tokens.length) {
    const token = tokens[i];
    if (/^[a-zA-Z]$/.test(token)) {
      cmd = token;
      i += 1;
      if (!(cmd.toUpperCase() in ARG_COUNT)) {
        throw new Error(`Unsupported path command "${cmd}"`);
      }
    } else if (cmd === "") {
      throw new Error("Path data must start with a command");
    }

    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    const ox: number = rel ? cx : 0;
    const oy: number = rel ? cy : 0;

    if (upper === "Z") {
      segs.push({ t: "Z" });
      cx = sx;
      cy = sy;
      lastCubic = null;
      lastQuad = null;
      continue;
    }

    switch (upper) {
      case "M": {
        const x = num() + ox;
        const y = num() + oy;
        segs.push({ t: "M", x, y });
        cx = sx = x;
        cy = sy = y;
        // Extra coordinate pairs after M are implicit lineto commands.
        cmd = rel ? "l" : "L";
        lastCubic = lastQuad = null;
        break;
      }
      case "L": {
        const x = num() + ox;
        const y = num() + oy;
        segs.push({ t: "L", x, y });
        cx = x;
        cy = y;
        lastCubic = lastQuad = null;
        break;
      }
      case "H": {
        const x = num() + ox;
        segs.push({ t: "L", x, y: cy });
        cx = x;
        lastCubic = lastQuad = null;
        break;
      }
      case "V": {
        const y = num() + oy;
        segs.push({ t: "L", x: cx, y });
        cy = y;
        lastCubic = lastQuad = null;
        break;
      }
      case "C": {
        const x1 = num() + ox;
        const y1 = num() + oy;
        const x2 = num() + ox;
        const y2 = num() + oy;
        const x = num() + ox;
        const y = num() + oy;
        segs.push({ t: "C", x1, y1, x2, y2, x, y });
        lastCubic = { x: x2, y: y2 };
        lastQuad = null;
        cx = x;
        cy = y;
        break;
      }
      case "S": {
        const x2 = num() + ox;
        const y2 = num() + oy;
        const x = num() + ox;
        const y = num() + oy;
        const x1: number = lastCubic ? 2 * cx - lastCubic.x : cx;
        const y1: number = lastCubic ? 2 * cy - lastCubic.y : cy;
        segs.push({ t: "C", x1, y1, x2, y2, x, y });
        lastCubic = { x: x2, y: y2 };
        lastQuad = null;
        cx = x;
        cy = y;
        break;
      }
      case "Q": {
        const x1 = num() + ox;
        const y1 = num() + oy;
        const x = num() + ox;
        const y = num() + oy;
        segs.push({ t: "Q", x1, y1, x, y });
        lastQuad = { x: x1, y: y1 };
        lastCubic = null;
        cx = x;
        cy = y;
        break;
      }
      case "T": {
        const x = num() + ox;
        const y = num() + oy;
        const x1: number = lastQuad ? 2 * cx - lastQuad.x : cx;
        const y1: number = lastQuad ? 2 * cy - lastQuad.y : cy;
        segs.push({ t: "Q", x1, y1, x, y });
        lastQuad = { x: x1, y: y1 };
        lastCubic = null;
        cx = x;
        cy = y;
        break;
      }
      case "A": {
        // rx ry rotation large-arc sweep x y — keep only the end point.
        num();
        num();
        num();
        num();
        num();
        const x = num() + ox;
        const y = num() + oy;
        segs.push({ t: "L", x, y });
        cx = x;
        cy = y;
        lastCubic = lastQuad = null;
        break;
      }
    }
  }

  return segs;
}

function fmt(n: number, precision: number): string {
  const v = Number(n.toFixed(precision));
  return String(Object.is(v, -0) ? 0 : v);
}

export interface AnchorRef {
  x: number;
  y: number;
  /** Index of the owning segment. */
  seg: number;
}

/** On-curve anchor point of every non-Z segment. */
export function pathAnchors(segs: readonly Seg[]): AnchorRef[] {
  const out: AnchorRef[] = [];
  segs.forEach((s, i) => {
    if (s.t !== "Z") out.push({ x: s.x, y: s.y, seg: i });
  });
  return out;
}

/**
 * Move the anchor owned by `segIndex` by (dx, dy), carrying its bezier handles
 * (the segment's own incoming handle and the next segment's outgoing handle) so
 * the curve shape around the node is preserved.
 */
export function moveAnchor(segs: readonly Seg[], segIndex: number, dx: number, dy: number): Seg[] {
  if (segIndex < 0 || segIndex >= segs.length || segs[segIndex].t === "Z") return segs.slice();
  return segs.map((s, i) => {
    if (i === segIndex) {
      if (s.t === "M" || s.t === "L") return { ...s, x: s.x + dx, y: s.y + dy };
      if (s.t === "C") return { ...s, x2: s.x2 + dx, y2: s.y2 + dy, x: s.x + dx, y: s.y + dy };
      if (s.t === "Q") return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x: s.x + dx, y: s.y + dy };
    }
    if (i === segIndex + 1) {
      if (s.t === "C") return { ...s, x1: s.x1 + dx, y1: s.y1 + dy };
      if (s.t === "Q") return { ...s, x1: s.x1 + dx, y1: s.y1 + dy };
    }
    return s;
  });
}

/** Endpoint of a segment (the start of the next one). M/L/C/Q carry x,y. */
function segEnd(s: Seg): Point | null {
  return s.t === "Z" ? null : { x: s.x, y: s.y };
}
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * Insert a node on segment `segIndex` at parameter t, splitting it in two.
 * Lines split linearly; cubics/quadratics split with de Casteljau so the shape
 * is unchanged. Segment 0 (the M) has no preceding point, so it can't split.
 */
export function insertNode(segs: readonly Seg[], segIndex: number, t = 0.5): Seg[] {
  if (segIndex < 1 || segIndex >= segs.length) return segs.slice();
  const start = segEnd(segs[segIndex - 1]);
  const s = segs[segIndex];
  if (!start || s.t === "Z" || s.t === "M") return segs.slice();
  const out = segs.slice();
  if (s.t === "L") {
    const mid = lerp(start, { x: s.x, y: s.y }, t);
    out.splice(segIndex, 1, { t: "L", x: mid.x, y: mid.y }, { t: "L", x: s.x, y: s.y });
  } else if (s.t === "C") {
    const p1 = { x: s.x1, y: s.y1 };
    const p2 = { x: s.x2, y: s.y2 };
    const p3 = { x: s.x, y: s.y };
    const a = lerp(start, p1, t);
    const b = lerp(p1, p2, t);
    const c = lerp(p2, p3, t);
    const d = lerp(a, b, t);
    const e = lerp(b, c, t);
    const f = lerp(d, e, t);
    out.splice(
      segIndex,
      1,
      { t: "C", x1: a.x, y1: a.y, x2: d.x, y2: d.y, x: f.x, y: f.y },
      { t: "C", x1: e.x, y1: e.y, x2: c.x, y2: c.y, x: p3.x, y: p3.y },
    );
  } else if (s.t === "Q") {
    const p1 = { x: s.x1, y: s.y1 };
    const p2 = { x: s.x, y: s.y };
    const a = lerp(start, p1, t);
    const b = lerp(p1, p2, t);
    const c = lerp(a, b, t);
    out.splice(segIndex, 1, { t: "Q", x1: a.x, y1: a.y, x: c.x, y: c.y }, { t: "Q", x1: b.x, y1: b.y, x: p2.x, y: p2.y });
  }
  return out;
}

/** Remove the anchor owned by `segIndex`. Keeps at least two anchors; never removes the M. */
export function deleteNode(segs: readonly Seg[], segIndex: number): Seg[] {
  const anchorCount = segs.filter((s) => s.t !== "Z").length;
  if (segIndex <= 0 || segIndex >= segs.length || segs[segIndex].t === "Z" || anchorCount <= 2) return segs.slice();
  return segs.filter((_s, i) => i !== segIndex);
}

/** Move a bezier control handle: "in" = this segment's own handle, "out" = the next segment's. */
export function moveHandle(segs: readonly Seg[], segIndex: number, which: "in" | "out", dx: number, dy: number): Seg[] {
  const target = which === "in" ? segIndex : segIndex + 1;
  return segs.map((s, i) => {
    if (i !== target) return s;
    if (which === "in") {
      if (s.t === "C") return { ...s, x2: s.x2 + dx, y2: s.y2 + dy };
      if (s.t === "Q") return { ...s, x1: s.x1 + dx, y1: s.y1 + dy };
    } else {
      if (s.t === "C" || s.t === "Q") return { ...s, x1: s.x1 + dx, y1: s.y1 + dy };
    }
    return s;
  });
}

function evalSeg(start: Point, s: Seg, t: number): Point {
  if (s.t === "L") return lerp(start, { x: s.x, y: s.y }, t);
  if (s.t === "C") {
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    return { x: a * start.x + b * s.x1 + c * s.x2 + d * s.x, y: a * start.y + b * s.y1 + c * s.y2 + d * s.y };
  }
  if (s.t === "Q") {
    const mt = 1 - t;
    return { x: mt * mt * start.x + 2 * mt * t * s.x1 + t * t * s.x, y: mt * mt * start.y + 2 * mt * t * s.y1 + t * t * s.y };
  }
  return s.t === "Z" ? start : { x: s.x, y: s.y };
}

/** Nearest segment + parameter to a point, for inserting a node where the user clicks. */
export function nearestOnPath(segs: readonly Seg[], pt: Point): { seg: number; t: number } | null {
  let best: { seg: number; t: number } | null = null;
  let bestD = Infinity;
  const N = 16;
  for (let i = 1; i < segs.length; i++) {
    const start = segEnd(segs[i - 1]);
    const s = segs[i];
    if (!start || s.t === "Z" || s.t === "M") continue;
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const p = evalSeg(start, s, t);
      const d = (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { seg: i, t };
      }
    }
  }
  return best;
}

export function serializePath(segs: readonly Seg[], precision = 3): string {
  const f = (n: number) => fmt(n, precision);
  return segs
    .map((s) => {
      switch (s.t) {
        case "M":
          return `M${f(s.x)} ${f(s.y)}`;
        case "L":
          return `L${f(s.x)} ${f(s.y)}`;
        case "C":
          return `C${f(s.x1)} ${f(s.y1)} ${f(s.x2)} ${f(s.y2)} ${f(s.x)} ${f(s.y)}`;
        case "Q":
          return `Q${f(s.x1)} ${f(s.y1)} ${f(s.x)} ${f(s.y)}`;
        case "Z":
          return "Z";
      }
    })
    .join("");
}

export function transformPoint(m: Matrix, x: number, y: number): Point {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export function transformSegs(segs: readonly Seg[], m: Matrix): Seg[] {
  return segs.map((s): Seg => {
    switch (s.t) {
      case "M":
      case "L": {
        const p = transformPoint(m, s.x, s.y);
        return { t: s.t, x: p.x, y: p.y };
      }
      case "C": {
        const a = transformPoint(m, s.x1, s.y1);
        const b = transformPoint(m, s.x2, s.y2);
        const p = transformPoint(m, s.x, s.y);
        return { t: "C", x1: a.x, y1: a.y, x2: b.x, y2: b.y, x: p.x, y: p.y };
      }
      case "Q": {
        const a = transformPoint(m, s.x1, s.y1);
        const p = transformPoint(m, s.x, s.y);
        return { t: "Q", x1: a.x, y1: a.y, x: p.x, y: p.y };
      }
      case "Z":
        return s;
    }
  });
}

export function translateSegs(segs: readonly Seg[], dx: number, dy: number): Seg[] {
  return transformSegs(segs, [1, 0, 0, 1, dx, dy]);
}

export interface Polyline {
  points: Point[];
  closed: boolean;
}

const CURVE_STEPS = 24;

/** Flatten segments into polylines, one per subpath. */
export function flattenSegs(segs: readonly Seg[], steps = CURVE_STEPS): Polyline[] {
  const out: Polyline[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  // Holder object: TypeScript does not track assignments through closures.
  const open: { line: Polyline | undefined } = { line: undefined };

  const begin = (x: number, y: number): Polyline => {
    const line: Polyline = { points: [{ x, y }], closed: false };
    open.line = line;
    out.push(line);
    return line;
  };
  const ensure = (): Polyline => open.line ?? begin(cx, cy);

  for (const s of segs) {
    switch (s.t) {
      case "M":
        begin(s.x, s.y);
        cx = sx = s.x;
        cy = sy = s.y;
        break;
      case "L":
        ensure().points.push({ x: s.x, y: s.y });
        cx = s.x;
        cy = s.y;
        break;
      case "C": {
        const line = ensure();
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const u = 1 - t;
          line.points.push({
            x: u * u * u * cx + 3 * u * u * t * s.x1 + 3 * u * t * t * s.x2 + t * t * t * s.x,
            y: u * u * u * cy + 3 * u * u * t * s.y1 + 3 * u * t * t * s.y2 + t * t * t * s.y,
          });
        }
        cx = s.x;
        cy = s.y;
        break;
      }
      case "Q": {
        const line = ensure();
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const u = 1 - t;
          line.points.push({
            x: u * u * cx + 2 * u * t * s.x1 + t * t * s.x,
            y: u * u * cy + 2 * u * t * s.y1 + t * t * s.y,
          });
        }
        cx = s.x;
        cy = s.y;
        break;
      }
      case "Z":
        if (open.line) {
          open.line.closed = true;
          cx = sx;
          cy = sy;
          // A following drawing command without M starts a new subpath here.
          open.line = undefined;
        }
        break;
    }
  }
  return out;
}

export function polylineLength(line: Polyline): number {
  const pts = line.points;
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  if (line.closed && pts.length > 1) {
    const a = pts[pts.length - 1];
    const b = pts[0];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

export function pointsBBox(points: readonly Point[]): BBox | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function segsBBox(segs: readonly Seg[]): BBox | null {
  const points: Point[] = [];
  for (const line of flattenSegs(segs)) points.push(...line.points);
  return pointsBBox(points);
}

export interface NormalizedPath {
  d: string;
  /** Where the original bounding box started. */
  dx: number;
  dy: number;
  width: number;
  height: number;
}

/** Shift segments so their bounding box starts at (0, 0). */
export function normalizeSegs(segs: readonly Seg[]): NormalizedPath {
  const box = segsBBox(segs);
  if (!box) return { d: "", dx: 0, dy: 0, width: 0, height: 0 };
  return {
    d: serializePath(translateSegs(segs, -box.minX, -box.minY)),
    dx: box.minX,
    dy: box.minY,
    width: box.maxX - box.minX,
    height: box.maxY - box.minY,
  };
}

/** Shift path data so its bounding box starts at (0, 0). */
export function normalizePath(d: string): NormalizedPath {
  return normalizeSegs(parsePath(d));
}

const KAPPA = 0.5522847498307936;

export function rectSegs(width: number, height: number, radius: number): Seg[] {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (r === 0) {
    return [
      { t: "M", x: 0, y: 0 },
      { t: "L", x: width, y: 0 },
      { t: "L", x: width, y: height },
      { t: "L", x: 0, y: height },
      { t: "Z" },
    ];
  }
  const k = r * KAPPA;
  return [
    { t: "M", x: r, y: 0 },
    { t: "L", x: width - r, y: 0 },
    { t: "C", x1: width - r + k, y1: 0, x2: width, y2: r - k, x: width, y: r },
    { t: "L", x: width, y: height - r },
    { t: "C", x1: width, y1: height - r + k, x2: width - r + k, y2: height, x: width - r, y: height },
    { t: "L", x: r, y: height },
    { t: "C", x1: r - k, y1: height, x2: 0, y2: height - r + k, x: 0, y: height - r },
    { t: "L", x: 0, y: r },
    { t: "C", x1: 0, y1: r - k, x2: r - k, y2: 0, x: r, y: 0 },
    { t: "Z" },
  ];
}

/** Ellipse centred on the origin. */
export function ellipseSegs(rx: number, ry: number): Seg[] {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    { t: "M", x: rx, y: 0 },
    { t: "C", x1: rx, y1: ky, x2: kx, y2: ry, x: 0, y: ry },
    { t: "C", x1: -kx, y1: ry, x2: -rx, y2: ky, x: -rx, y: 0 },
    { t: "C", x1: -rx, y1: -ky, x2: -kx, y2: -ry, x: 0, y: -ry },
    { t: "C", x1: kx, y1: -ry, x2: rx, y2: -ky, x: rx, y: 0 },
    { t: "Z" },
  ];
}
