import { z } from "zod";
import { MAX_MAT_MM, MIN_MAT_MM } from "./mats";
import type { Doc } from "./types";

export const PROJECT_FORMAT = "cutdesk";
export const PROJECT_VERSION = 2;
export const PROJECT_EXTENSION = ".cutdesk.json";

/** A project is one or more pages (each its own mat), plus which one is active. */
export interface Project {
  pages: Doc[];
  activePage: number;
}

const num = z.number();
const positive = z.number().positive();

const geometry = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rect"),
    width: positive,
    height: positive,
    cornerRadius: z.number().min(0),
  }),
  z.object({ kind: z.literal("ellipse"), rx: positive, ry: positive }),
  z.object({ kind: z.literal("path"), d: z.string().max(5_000_000) }),
  z.object({
    kind: z.literal("text"),
    text: z.string().max(2000),
    fontId: z.enum(["lilita", "pacifico", "bricolage", "hanken"]),
    size: positive,
    letterSpacing: num,
    d: z.string().max(5_000_000),
    width: z.number().min(0),
    height: z.number().min(0),
  }),
  z.object({
    kind: z.literal("image"),
    src: z.string().startsWith("data:image/"),
    width: positive,
    height: positive,
  }),
]);

const layer = z.object({
  id: z.string().min(1),
  name: z.string().max(120),
  operation: z.enum(["cut", "score", "draw", "print"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  visible: z.boolean(),
  locked: z.boolean(),
});

const object = z.object({
  id: z.string().min(1),
  name: z.string().max(120),
  layerId: z.string().min(1),
  x: num,
  y: num,
  rotation: num,
  scaleX: num,
  scaleY: num,
  geo: geometry,
  style: z
    .object({
      fill: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      opacity: z.number().min(0).max(1).optional(),
    })
    .optional(),
  groupId: z.string().min(1).max(64).optional(),
});

const docSchema = z.object({
  name: z.string().max(200),
  unit: z.enum(["mm", "in"]),
  mat: z.object({
    preset: z.enum(["cricut-12x12", "cricut-12x24", "a4", "a3", "custom"]),
    width: z.number().min(MIN_MAT_MM).max(MAX_MAT_MM),
    height: z.number().min(MIN_MAT_MM).max(MAX_MAT_MM),
  }),
  layers: z.array(layer).min(1),
  objects: z.array(object),
});

// v1 held a single `doc`; v2 holds `pages` + `activePage`. Both are accepted.
const fileV1 = z.object({
  format: z.literal(PROJECT_FORMAT),
  version: z.literal(1),
  doc: docSchema,
});
const fileV2 = z.object({
  format: z.literal(PROJECT_FORMAT),
  version: z.literal(2),
  pages: z.array(docSchema).min(1),
  activePage: z.number().int().min(0),
});

export function serializeProject(project: Project): string {
  return JSON.stringify(
    { format: PROJECT_FORMAT, version: PROJECT_VERSION, pages: project.pages, activePage: project.activePage },
    null,
    2,
  );
}

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectError";
  }
}

/** Repair a doc: drop duplicate object ids and reattach objects whose layer is gone. */
function normalizeDoc(doc: Doc): Doc {
  const layerIds = new Set(doc.layers.map((l) => l.id));
  const fallback = doc.layers[0].id;
  const seen = new Set<string>();
  const objects = doc.objects
    .filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    })
    .map((o) => (layerIds.has(o.layerId) ? o : { ...o, layerId: fallback }));
  return { ...doc, objects };
}

/** Parse and validate a project file. Throws ProjectError with a readable message. */
export function parseProject(text: string): Project {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProjectError("This file isn't valid JSON, so it can't be a CutDesk project.");
  }

  // A valid project is tagged with our format marker; without it, it's just
  // some other JSON (the schema union wouldn't pin the error to `format`).
  if (typeof json !== "object" || json === null || (json as { format?: unknown }).format !== PROJECT_FORMAT) {
    throw new ProjectError("This isn't a CutDesk project file.");
  }

  // Pick the schema by version so error messages point at the exact field.
  const schema = (json as { version?: unknown }).version === 1 ? fileV1 : fileV2;
  const result = schema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue.path.length ? ` (at ${issue.path.join(".")})` : "";
    throw new ProjectError(`This project file is damaged: ${issue.message}${where}.`);
  }

  const data = result.data;
  const pages = ("pages" in data ? data.pages : [data.doc]).map((d) => normalizeDoc(d as Doc));
  const activePage = "activePage" in data ? Math.min(data.activePage, pages.length - 1) : 0;
  return { pages, activePage };
}
