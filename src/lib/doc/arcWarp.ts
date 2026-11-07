/**
 * Bend a path along a circular arc — "curved text". The path is laid out flat
 * across [0, width]; each point is mapped onto an arc whose total sweep is
 * `arcDeg` degrees. Zero (or no width) leaves the path untouched. Pure.
 */

import { parsePath, serializePath, type Seg } from "./pathData";

export function arcWarpPath(d: string, width: number, arcDeg: number): string {
  const sweep = (arcDeg * Math.PI) / 180;
  if (!d || !(width > 0) || !Number.isFinite(sweep) || Math.abs(sweep) < 1e-4) return d;
  const R = width / sweep; // signed: arc length across the width equals `width`

  const warp = (x: number, y: number) => {
    const angle = (x - width / 2) / R;
    const rr = R - y;
    return { x: rr * Math.sin(angle), y: R - rr * Math.cos(angle) };
  };

  const segs = parsePath(d);
  const out: Seg[] = segs.map((s) => {
    switch (s.t) {
      case "M":
      case "L": {
        const p = warp(s.x, s.y);
        return { t: s.t, x: p.x, y: p.y };
      }
      case "C": {
        const a = warp(s.x1, s.y1);
        const b = warp(s.x2, s.y2);
        const p = warp(s.x, s.y);
        return { t: "C", x1: a.x, y1: a.y, x2: b.x, y2: b.y, x: p.x, y: p.y };
      }
      case "Q": {
        const a = warp(s.x1, s.y1);
        const p = warp(s.x, s.y);
        return { t: "Q", x1: a.x, y1: a.y, x: p.x, y: p.y };
      }
      default:
        return s;
    }
  });
  return serializePath(out, 3);
}
