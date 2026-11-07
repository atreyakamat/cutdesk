/**
 * Reusable fill + opacity presets, stored per-browser. Everything that comes
 * back out is validated, because the values are written into on-screen styles
 * and SVG/PNG/PDF exports — a bad fill must never reach rendering.
 */

import { newId } from "@/lib/doc/ids";

const KEY = "cutdesk:style-presets:v1";
export const MAX_PRESETS = 24;
const HEX = /^#[0-9a-fA-F]{6}$/;

export interface StylePreset {
  id: string;
  fill: string;
  opacity: number;
}

function valid(p: unknown): p is StylePreset {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.fill === "string" && HEX.test(o.fill) && typeof o.opacity === "number" && o.opacity >= 0 && o.opacity <= 1;
}

export function listStylePresets(): StylePreset[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(valid) : [];
  } catch {
    return [];
  }
}

/** Save a preset. Returns false (persists nothing) if the fill isn't a valid hex colour. */
export function saveStylePreset(fill: string, opacity: number): boolean {
  if (!HEX.test(fill)) return false;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : 1));
  try {
    const list = listStylePresets().filter((p) => !(p.fill.toLowerCase() === fill.toLowerCase() && p.opacity === clamped));
    list.unshift({ id: newId(), fill, opacity: clamped });
    globalThis.localStorage?.setItem(KEY, JSON.stringify(list.slice(0, MAX_PRESETS)));
    return true;
  } catch {
    return false;
  }
}

export function deleteStylePreset(id: string): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(listStylePresets().filter((p) => p.id !== id)));
  } catch {
    // storage unavailable — nothing to do
  }
}
