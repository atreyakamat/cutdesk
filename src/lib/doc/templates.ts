/**
 * Starter templates. Each builder returns a fresh, cut-ready document (its own
 * mat, layers and objects) that opens as a new page. User templates are the
 * active page saved to the browser so it can be reused later.
 */

import { z } from "zod";
import { createLayer } from "./defaults";
import { newId } from "./ids";
import { matFromPreset } from "./mats";
import { docSchema, normalizeDoc } from "./project";
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

/** A regular polygon of circum-radius `r`, bounds normalised to start at (0,0). */
function regularPolygon(r: number, sides: number, rot = -Math.PI / 2): { geo: Geometry; w: number; h: number } {
  const pts = Array.from({ length: sides }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / sides;
    return [r * Math.cos(a), r * Math.sin(a)] as const;
  });
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${(x - minX).toFixed(3)} ${(y - minY).toFixed(3)}`).join("") + "Z";
  return { geo: { kind: "path", d }, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

/** A downward-pointing bunting pennant, top-left origin. */
function pennant(w: number, h: number): Geometry {
  return { kind: "path", d: `M0 0L${w} 0L${w / 2} ${h}Z` };
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
  {
    id: "business-cards",
    name: "Business cards",
    description: "3 × 4 grid of 85 × 55 mm rounded cards",
    build: () =>
      build({
        name: "Business cards",
        mat: matFromPreset("cricut-12x12"),
        layers: [{ key: "cut", layer: createLayer("cut") }],
        objects: grid(305, 305, 3, 4, 12).map((c, i) => ({
          geo: rect(85, 55, 3),
          name: `Card ${i + 1}`,
          layerKey: "cut",
          init: { x: c.cx - 42.5, y: c.cy - 27.5 },
        })),
      }),
  },
  {
    id: "hex-labels",
    name: "Hexagon labels",
    description: "4 × 5 grid of 44 mm hexagons",
    build: () => {
      const hex = regularPolygon(22, 6);
      return build({
        name: "Hexagon labels",
        mat: matFromPreset("cricut-12x12"),
        layers: [{ key: "cut", layer: createLayer("cut") }],
        objects: grid(305, 305, 4, 5, 20).map((c, i) => ({
          geo: hex.geo,
          name: `Hex ${i + 1}`,
          layerKey: "cut",
          init: { x: c.cx - hex.w / 2, y: c.cy - hex.h / 2 },
        })),
      });
    },
  },
  {
    id: "bunting",
    name: "Bunting banner",
    description: "Five pennant flags on a string (score line)",
    build: () =>
      build({
        name: "Bunting banner",
        mat: matFromPreset("a4"),
        layers: [
          { key: "cut", layer: createLayer("cut") },
          { key: "score", layer: createLayer("score") },
        ],
        objects: [
          { geo: line(0, 0, 190, 0), name: "String", layerKey: "score", init: { x: 10, y: 20 } },
          ...[0, 1, 2, 3, 4].map((i) => ({
            geo: pennant(32, 44),
            name: `Flag ${i + 1}`,
            layerKey: "cut",
            init: { x: 12 + i * 38, y: 22 },
          })),
        ],
      }),
  },
  {
    id: "bookmarks",
    name: "Bookmarks",
    description: "Three 50 × 150 mm bookmarks with a tassel hole",
    build: () =>
      build({
        name: "Bookmarks",
        mat: matFromPreset("a4"),
        layers: [{ key: "cut", layer: createLayer("cut") }],
        objects: [0, 1, 2].flatMap((i) => {
          const x = 15 + i * 62;
          const y = 40;
          return [
            { geo: rect(50, 150, 8), name: `Bookmark ${i + 1}`, layerKey: "cut", init: { x, y } },
            { geo: circle(3), name: `Hole ${i + 1}`, layerKey: "cut", init: { x: x + 25, y: y + 12 } },
          ];
        }),
      }),
  },
] as const;

// --------------------------------------------------------------- user templates

const KEY = "cutdesk:templates:v1";
const MAX_TEMPLATES = 60;

export interface UserTemplate {
  id: string;
  name: string;
  doc: Doc;
  category?: string;
  description?: string;
  createdAt?: number;
}

export interface TemplateMeta {
  category?: string;
  description?: string;
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

function writeTemplates(list: UserTemplate[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_TEMPLATES)));
    return true;
  } catch {
    return false;
  }
}

/** Save a page as a reusable template. Returns false if storage is unavailable/full. */
export function saveUserTemplate(name: string, doc: Doc, meta: TemplateMeta = {}): boolean {
  const list = listUserTemplates();
  list.unshift({
    id: newId(),
    name: name.trim() || "Untitled template",
    doc,
    category: meta.category?.trim() || undefined,
    description: meta.description?.trim() || undefined,
    createdAt: Date.now(),
  });
  return writeTemplates(list);
}

/** Patch a saved template's editable metadata (name / category / description). */
export function updateUserTemplate(id: string, patch: TemplateMeta & { name?: string }): boolean {
  const list = listUserTemplates().map((t) =>
    t.id === id
      ? {
          ...t,
          name: patch.name !== undefined ? patch.name.trim() || t.name : t.name,
          category: "category" in patch ? patch.category?.trim() || undefined : t.category,
          description: "description" in patch ? patch.description?.trim() || undefined : t.description,
        }
      : t,
  );
  return writeTemplates(list);
}

export function duplicateUserTemplate(id: string): boolean {
  const list = listUserTemplates();
  const found = list.find((t) => t.id === id);
  if (!found) return false;
  list.unshift({ ...found, id: newId(), name: `${found.name} copy`, createdAt: Date.now() });
  return writeTemplates(list);
}

export function deleteUserTemplate(id: string): void {
  writeTemplates(listUserTemplates().filter((t) => t.id !== id));
}

// ------------------------------------------------------- export / import (pure)

export const TEMPLATE_BUNDLE_FORMAT = "cutdesk-templates";
export const TEMPLATE_BUNDLE_VERSION = 1;

const userTemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string().max(200).optional(),
  doc: docSchema,
  category: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  createdAt: z.number().optional(),
});
const bundleSchema = z.object({
  format: z.literal(TEMPLATE_BUNDLE_FORMAT),
  version: z.number(),
  templates: z.array(userTemplateSchema).max(500),
});

/** Serialise templates to a shareable, self-contained bundle (local backup/share). */
export function serializeTemplatesBundle(templates: UserTemplate[]): string {
  return JSON.stringify({ format: TEMPLATE_BUNDLE_FORMAT, version: TEMPLATE_BUNDLE_VERSION, templates }, null, 2);
}

/** Parse a bundle, validating every doc and giving each a fresh id. Throws on junk. */
export function parseTemplatesBundle(text: string): UserTemplate[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON, so it can't be a CutDesk template bundle.");
  }
  if (typeof json !== "object" || json === null || (json as { format?: unknown }).format !== TEMPLATE_BUNDLE_FORMAT) {
    throw new Error("This isn't a CutDesk template bundle.");
  }
  const result = bundleSchema.safeParse(json);
  if (!result.success) throw new Error("This template bundle is malformed and can't be imported.");
  return result.data.templates.map((t) => ({
    id: newId(),
    name: (t.name ?? "Imported template").trim() || "Imported template",
    doc: normalizeDoc(t.doc as Doc),
    category: t.category,
    description: t.description,
    createdAt: t.createdAt ?? Date.now(),
  }));
}

/** Import a bundle's templates into storage (prepended). Returns how many were added. */
export function importUserTemplates(text: string): number {
  const incoming = parseTemplatesBundle(text);
  const ok = writeTemplates([...incoming, ...listUserTemplates()]);
  return ok ? incoming.length : 0;
}
