/**
 * Starter templates. Each builder returns a fresh, cut-ready document (its own
 * mat, layers and objects) that opens as a new page. User templates are the
 * active page saved to the browser so it can be reused later.
 */

import { createLayer } from "./defaults";
import { newId } from "./ids";
import { matFromPreset } from "./mats";
import type { DesignObject, Doc, Geometry, Mat, Transform } from "./types";

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

interface Build {
  name: string;
  mat: Mat;
  layers: { key: string; layer: ReturnType<typeof createLayer> }[];
  objects: { geo: Geometry; name: string; layerKey: string; init?: Partial<Transform> }[];
}

function build(b: Build): Doc {
  const layers = b.layers.map((l) => l.layer);
  const idByKey = new Map(b.layers.map((l) => [l.key, l.layer.id] as const));
  const objects: DesignObject[] = b.objects.map((o) => ({
    id: newId(),
    name: o.name,
    layerId: idByKey.get(o.layerKey) ?? layers[0].id,
    ...DEFAULT_TRANSFORM,
    ...o.init,
    geo: o.geo,
  }));
  return { name: b.name, unit: "mm", mat: b.mat, layers, objects };
}

function rect(width: number, height: number, cornerRadius = 0): Geometry {
  return { kind: "rect", width, height, cornerRadius };
}
function circle(r: number): Geometry {
  return { kind: "ellipse", rx: r, ry: r };
}
function line(x0: number, y0: number, x1: number, y1: number): Geometry {
  // Path bounds must start at (0,0); the object's init x/y places it.
  return { kind: "path", d: `M0 0L${x1 - x0} ${y1 - y0}` };
}

/** Evenly spaced centres for a rows×cols grid inside a w×h mat with a margin. */
function grid(w: number, h: number, cols: number, rows: number, margin: number) {
  const cells: { cx: number; cy: number }[] = [];
  const stepX = (w - margin * 2) / cols;
  const stepY = (h - margin * 2) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ cx: margin + stepX * (c + 0.5), cy: margin + stepY * (r + 0.5) });
    }
  }
  return cells;
}

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  build: () => Doc;
}

export const BUILTIN_TEMPLATES: readonly TemplateDef[] = [
  {
    id: "greeting-card",
    name: "Folded greeting card",
    description: "A5 card with a fold score down the middle",
    build: () =>
      build({
        name: "Greeting card",
        mat: matFromPreset("a4"),
        layers: [
          { key: "cut", layer: createLayer("cut") },
          { key: "score", layer: createLayer("score") },
        ],
        objects: [
          { geo: rect(210, 148), name: "Card", layerKey: "cut", init: { x: 10, y: 10 } },
          { geo: line(0, 0, 0, 148), name: "Fold", layerKey: "score", init: { x: 115, y: 10 } },
        ],
      }),
  },
  {
    id: "round-labels",
    name: "Round labels",
    description: "3 × 4 grid of 50 mm circles",
    build: () =>
      build({
        name: "Round labels",
        mat: matFromPreset("cricut-12x12"),
        layers: [{ key: "cut", layer: createLayer("cut") }],
        objects: grid(305, 305, 3, 4, 25).map((c, i) => ({
          geo: circle(25),
          name: `Label ${i + 1}`,
          layerKey: "cut",
          init: { x: c.cx, y: c.cy },
        })),
      }),
  },
  {
    id: "sticker-sheet",
    name: "Sticker sheet",
    description: "4 × 5 grid of rounded squares",
    build: () =>
      build({
        name: "Sticker sheet",
        mat: matFromPreset("cricut-12x12"),
        layers: [{ key: "cut", layer: createLayer("cut") }],
        objects: grid(305, 305, 4, 5, 20).map((c, i) => ({
          geo: rect(50, 50, 8),
          name: `Sticker ${i + 1}`,
          layerKey: "cut",
          init: { x: c.cx - 25, y: c.cy - 25 },
        })),
      }),
  },
  {
    id: "gift-tag",
    name: "Gift tags",
    description: "Three rounded tags with a punch hole",
    build: () =>
      build({
        name: "Gift tags",
        mat: matFromPreset("a4"),
        layers: [{ key: "cut", layer: createLayer("cut") }],
        objects: [0, 1, 2].flatMap((i) => {
          const x = 20 + i * 70;
          const y = 40;
          return [
            { geo: rect(55, 95, 10), name: `Tag ${i + 1}`, layerKey: "cut", init: { x, y } },
            { geo: circle(4), name: `Hole ${i + 1}`, layerKey: "cut", init: { x: x + 27.5, y: y + 12 } },
          ];
        }),
      }),
  },
] as const;

// --------------------------------------------------------------- user templates

const KEY = "cutdesk:templates:v1";

export interface UserTemplate {
  id: string;
  name: string;
  doc: Doc;
}

export function listUserTemplates(): UserTemplate[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as UserTemplate[]) : [];
  } catch {
    return [];
  }
}

/** Save a page as a reusable template. Returns false if storage is unavailable/full. */
export function saveUserTemplate(name: string, doc: Doc): boolean {
  try {
    const list = listUserTemplates();
    list.unshift({ id: newId(), name: name.trim() || "Untitled template", doc });
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 60)));
    return true;
  } catch {
    return false;
  }
}

export function deleteUserTemplate(id: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(listUserTemplates().filter((t) => t.id !== id)));
  } catch {
    // Nothing to do if storage is unavailable.
  }
}
