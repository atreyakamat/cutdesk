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
