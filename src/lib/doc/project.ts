import { z } from "zod";
import { MAX_MAT_MM, MIN_MAT_MM } from "./mats";
import type { Doc } from "./types";

export const PROJECT_FORMAT = "cutdesk";
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = ".cutdesk.json";

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

const fileSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  version: z.number().int().min(1).max(PROJECT_VERSION),
  doc: docSchema,
});

export function serializeProject(doc: Doc): string {
  return JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION, doc }, null, 2);
}

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectError";
  }
}

/** Parse and validate a project file. Throws ProjectError with a readable message. */
export function parseProject(text: string): Doc {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProjectError("This file isn't valid JSON, so it can't be a CutDesk project.");
  }

  const result = fileSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue.path.length ? ` (at ${issue.path.join(".")})` : "";
    if (issue.path[0] === "format") {
      throw new ProjectError("This isn't a CutDesk project file.");
    }
    throw new ProjectError(`This project file is damaged: ${issue.message}${where}.`);
  }

  const doc = result.data.doc as Doc;

  // Objects pointing at a missing layer move to the first layer instead of vanishing.
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
