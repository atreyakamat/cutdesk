/**
 * Built-in gallery of cut-ready shapes, generated programmatically so they are
 * exact vector paths (no tracing) in millimetres, ready to drop on the mat and
 * cut. Everything here is generated maths — no third-party assets — so it's
 * licence-clean and scales: add a generator and the catalog grows. A big hosted
 * catalog can be layered on later behind the same GalleryShape shape.
 *
 * The "Icons" category is a curated open pack (Bootstrap Icons, MIT) baked in by
 * scripts/gen-icons.mjs — see ./icons.ts.
 */

import { ICONS } from "./icons";

export interface GalleryShape {
  id: string;
  name: string;
  category: string;
  /** SVG path data, bounding box starting at (0, 0). */
  d: string;
  /** Millimetres. */
  width: number;
  height: number;
}

type Pt = [number, number];

function build(points: Pt[]): { d: string; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const d =
    "M " +
    points.map(([x, y]) => `${(x - minX).toFixed(2)} ${(y - minY).toFixed(2)}`).join(" L ") +
    " Z";
  return { d, width: Number((maxX - minX).toFixed(2)), height: Number((maxY - minY).toFixed(2)) };
}

function polygon(n: number, r = 30, rot = -Math.PI / 2): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

function star(points: number, ro = 30, ri = 15, rot = -Math.PI / 2): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points;
    const r = i % 2 === 0 ? ro : ri;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

function sample(fn: (t: number) => Pt, steps = 180): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i++) pts.push(fn((i / steps) * Math.PI * 2));
  return pts;
}

function gear(teeth: number, ro = 30, ri = 23): Pt[] {
  const pts: Pt[] = [];
  const step = (2 * Math.PI) / teeth;
  const at = (r: number, a: number): Pt => [r * Math.cos(a), r * Math.sin(a)];
  for (let k = 0; k < teeth; k++) {
    const a = k * step;
    pts.push(at(ri, a), at(ro, a + step * 0.18), at(ro, a + step * 0.5), at(ri, a + step * 0.68));
  }
  return pts;
}

function plus(arm = 32, t = 13): Pt[] {
  const o = t;
  return [
    [-o, -arm], [o, -arm], [o, -o], [arm, -o], [arm, o], [o, o],
    [o, arm], [-o, arm], [-o, o], [-arm, o], [-arm, -o], [-o, -o],
  ];
}

function arrow(): Pt[] {
  return [[-30, -10], [6, -10], [6, -24], [34, 0], [6, 24], [6, 10], [-30, 10]];
}

function chevron(): Pt[] {
  return [[-18, -26], [2, -4], [22, -26], [30, -16], [2, 14], [-26, -16]];
}

function heart(): Pt[] {
  return sample(
    (t) => [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))],
    160,
  ).map(([x, y]) => [x * 1.7, y * 1.7] as Pt);
}

const POLY_NAMES: Record<number, string> = {
  3: "Triangle", 5: "Pentagon", 6: "Hexagon", 7: "Heptagon", 8: "Octagon",
  9: "Nonagon", 10: "Decagon", 11: "Hendecagon", 12: "Dodecagon",
};

function buildCatalog(): GalleryShape[] {
  const shapes: GalleryShape[] = [];
  let n = 0;
  const add = (name: string, category: string, geo: { d: string; width: number; height: number }) =>
    shapes.push({ id: `g${++n}`, name, category, ...geo });

  // Basics
  add("Circle", "Basic", build(polygon(64, 30)));
  add("Square", "Basic", build([[-30, -30], [30, -30], [30, 30], [-30, 30]]));
  add("Rectangle", "Basic", build([[-36, -24], [36, -24], [36, 24], [-36, 24]]));
  add("Diamond", "Basic", build(polygon(4, 32)));
  add("Ellipse", "Basic", build(sample((t) => [36 * Math.cos(t), 24 * Math.sin(t)])));
  add("Heart", "Basic", build(heart()));
  add("Plus", "Basic", build(plus()));
  add("Arrow", "Basic", build(arrow()));
  add("Chevron", "Basic", build(chevron()));

  // Polygons
  for (let s = 3; s <= 24; s++) {
    if (s === 4) continue; // square/diamond covered above
    add(POLY_NAMES[s] ?? `${s}-gon`, "Polygons", build(polygon(s, 30)));
  }

  // Stars
  for (const pts of [4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20]) {
    for (const ratio of [0.38, 0.5, 0.62]) {
      add(`${pts}-point star`, "Stars", build(star(pts, 30, 30 * ratio)));
    }
  }
  for (const pts of [12, 16, 20, 24]) add(`${pts}-ray burst`, "Stars", build(star(pts, 30, 21)));

  // Flowers
  for (const petals of [4, 5, 6, 7, 8, 10, 12, 14]) {
    add(`${petals}-petal flower`, "Flowers", build(sample((t) => {
      const r = 30 * (0.58 + 0.42 * Math.cos(petals * t));
      return [r * Math.cos(t), r * Math.sin(t)];
    }, 240)));
  }

  // Gears
  for (const teeth of [6, 8, 10, 12, 16, 20]) add(`${teeth}-tooth gear`, "Gears", build(gear(teeth)));

  return shapes;
}

export const CATALOG: GalleryShape[] = [...buildCatalog(), ...ICONS];

export const CATEGORIES: string[] = Array.from(new Set(CATALOG.map((s) => s.category)));
