/**
 * Import an SVG as editable cut paths. Pure and DOM-free (regex + path math),
 * so it runs the same in the browser and in tests. Handles the common elements
 * (path, rect, circle, ellipse, polygon, polyline, line) with per-element
 * transforms, and scales the whole drawing to a target size in millimetres.
 *
 * Not handled (v1): nested <g> transforms, gradients/filters, text. Those
 * degrade gracefully — the shapes still come in, just without a group transform.
 */

import {
  ellipseSegs,
  parsePath,
  rectSegs,
  segsBBox,
  serializePath,
  transformSegs,
  translateSegs,
  type Matrix,
  type Seg,
} from "../doc/pathData";

export interface ImportedPath {
  /** Path data with its bounding box at (0, 0), in mm. */
  d: string;
  /** Offset of this path within the imported drawing, in mm. */
  x: number;
  y: number;
}
export interface ImportedSvg {
  paths: ImportedPath[];
  width: number;
  height: number;
}

const IDENT: Matrix = [1, 0, 0, 1, 0, 0];

function mul(x: Matrix, y: Matrix): Matrix {
  return [
    x[0] * y[0] + x[2] * y[1],
    x[1] * y[0] + x[3] * y[1],
    x[0] * y[2] + x[2] * y[3],
    x[1] * y[2] + x[3] * y[3],
    x[0] * y[4] + x[2] * y[5] + x[4],
    x[1] * y[4] + x[3] * y[5] + x[5],
  ];
}

function parseTransform(str: string): Matrix {
  let m = IDENT;
  const re = /(\w+)\s*\(([^)]*)\)/g;
  let t: RegExpExecArray | null;
  while ((t = re.exec(str))) {
    const n = t[2].split(/[\s,]+/).map(Number).filter((v) => Number.isFinite(v));
    switch (t[1]) {
      case "translate":
        m = mul(m, [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0]);
        break;
      case "scale":
        m = mul(m, [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0]);
        break;
      case "matrix":
        if (n.length === 6) m = mul(m, n as unknown as Matrix);
        break;
      case "rotate": {
        const r = ((n[0] ?? 0) * Math.PI) / 180;
        const cos = Math.cos(r);
        const sin = Math.sin(r);
        const rot: Matrix = [cos, sin, -sin, cos, 0, 0];
        if (n.length >= 3) {
          m = mul(m, mul([1, 0, 0, 1, n[1], n[2]], mul(rot, [1, 0, 0, 1, -n[1], -n[2]])));
        } else {
          m = mul(m, rot);
        }
        break;
      }
    }
  }
  return m;
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w-]+)\s*=\s*"([^"]*)"/g;
  let a: RegExpExecArray | null;
  while ((a = re.exec(tag))) out[a[1]] = a[2];
  return out;
}

const num = (v: string | undefined, d = 0) => {
  const n = parseFloat(v ?? "");
  return Number.isFinite(n) ? n : d;
};

function pointsToSegs(points: string, close: boolean): Seg[] {
  const nums = points.split(/[\s,]+/).map(Number).filter((v) => Number.isFinite(v));
  const segs: Seg[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) segs.push({ t: i === 0 ? "M" : "L", x: nums[i], y: nums[i + 1] });
  if (close && segs.length) segs.push({ t: "Z" });
  return segs;
}

function elementSegs(name: string, a: Record<string, string>): Seg[] {
  switch (name) {
    case "path":
      return a.d ? parsePath(a.d) : [];
    case "rect":
      return translateSegs(rectSegs(num(a.width), num(a.height), num(a.rx)), num(a.x), num(a.y));
    case "circle":
      return translateSegs(ellipseSegs(num(a.r), num(a.r)), num(a.cx), num(a.cy));
    case "ellipse":
      return translateSegs(ellipseSegs(num(a.rx), num(a.ry)), num(a.cx), num(a.cy));
    case "polygon":
      return pointsToSegs(a.points ?? "", true);
    case "polyline":
      return pointsToSegs(a.points ?? "", false);
    case "line":
      return [
        { t: "M", x: num(a.x1), y: num(a.y1) },
        { t: "L", x: num(a.x2), y: num(a.y2) },
      ];
    default:
      return [];
  }
}

export function parseSvg(svg: string, opts: { sizeMm?: number } = {}): ImportedSvg {
  const size = opts.sizeMm && opts.sizeMm > 0 ? opts.sizeMm : 80;
  const empty: ImportedSvg = { paths: [], width: 0, height: 0 };
  if (typeof svg !== "string" || !/<svg[\s>]/i.test(svg)) return empty;

  // Drop hidden definitions so we don't import clip/mask geometry.
  const body = svg.replace(/<(defs|clipPath|mask|symbol)\b[\s\S]*?<\/\1>/gi, "");

  const collected: Seg[][] = [];
  const re = /<(path|rect|circle|ellipse|polygon|polyline|line)\b([^>]*?)\/?>/gi;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = re.exec(body)) && count < 5000) {
    count++;
    const a = attrs(m[2]);
    let segs = elementSegs(m[1].toLowerCase(), a);
    if (segs.length < 2) continue;
    if (a.transform) segs = transformSegs(segs, parseTransform(a.transform));
    // Drop any element whose geometry went non-finite (overflow/NaN transforms).
    const eb = segsBBox(segs);
    if (!eb || ![eb.minX, eb.minY, eb.maxX, eb.maxY].every(Number.isFinite)) continue;
    collected.push(segs);
  }
  if (collected.length === 0) return empty;

  const gb = segsBBox(collected.flat());
  if (!gb) return empty;
  const w0 = gb.maxX - gb.minX;
  const h0 = gb.maxY - gb.minY;
  const scale = size / Math.max(w0, h0 || 1, 1e-6);
  const toMm: Matrix = [scale, 0, 0, scale, -gb.minX * scale, -gb.minY * scale];

  const paths: ImportedPath[] = [];
  for (const segs of collected) {
    const s = transformSegs(segs, toMm);
    const b = segsBBox(s);
    if (!b) continue;
    paths.push({ d: serializePath(translateSegs(s, -b.minX, -b.minY), 2), x: b.minX, y: b.minY });
  }
  return { paths, width: w0 * scale, height: h0 * scale };
}
