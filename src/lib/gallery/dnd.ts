/**
 * Drag-and-drop from the Elements panel onto the mat. The panel tile sets a
 * compact payload on the drag; the canvas drop handler parses it (untrusted,
 * so validated) and builds an object placed under the cursor.
 */

import type { Geometry, Point, Transform } from "@/lib/doc/types";
import { emojiToDataUrl } from "./emoji";

export const DND_MIME = "application/x-cutdesk-item";

export type DragPayload =
  | { t: "path"; d: string; w: number; h: number; name: string }
  | { t: "emoji"; char: string; name: string };

export interface DroppedObject {
  geo: Geometry;
  name: string;
  init: Partial<Transform>;
}

export function serializeDragPayload(payload: DragPayload): string {
  return JSON.stringify(payload);
}

/** Parse a drag payload defensively; returns null for anything unexpected. */
export function parseDragPayload(text: string): DragPayload | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.t === "path" && typeof o.d === "string" && typeof o.w === "number" && typeof o.h === "number" && typeof o.name === "string") {
    if (!Number.isFinite(o.w) || !Number.isFinite(o.h) || o.d.length === 0 || o.d.length > 5_000_000) return null;
    return { t: "path", d: o.d, w: o.w, h: o.h, name: o.name };
  }
  if (o.t === "emoji" && typeof o.char === "string" && typeof o.name === "string" && o.char.length > 0) {
    return { t: "emoji", char: o.char, name: o.name };
  }
  return null;
}

/** Build the object to add, centred on the drop point `at` (in mm). */
export function buildDropObject(payload: DragPayload, at: Point): DroppedObject | null {
  if (payload.t === "path") {
    return { geo: { kind: "path", d: payload.d }, name: payload.name, init: { x: at.x - payload.w / 2, y: at.y - payload.h / 2 } };
  }
  const src = emojiToDataUrl(payload.char);
  if (!src) return null;
  return { geo: { kind: "image", src, width: 60, height: 60 }, name: payload.name, init: { x: at.x - 30, y: at.y - 30 } };
}
