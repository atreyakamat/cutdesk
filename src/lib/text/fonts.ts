import { parse, type Font, type PathCommand } from "opentype.js";
import { normalizeSegs, type Seg } from "../doc/pathData";
import type { FontId } from "../doc/types";

export interface FontInfo {
  id: FontId;
  label: string;
  /** Static WOFF served from /public/fonts. opentype.js cannot read WOFF2. */
  url: string;
}

export const FONTS: readonly FontInfo[] = [
  { id: "lilita", label: "Lilita One", url: "/fonts/lilita-one-latin-400-normal.woff" },
  { id: "pacifico", label: "Pacifico", url: "/fonts/pacifico-latin-400-normal.woff" },
  { id: "bricolage", label: "Bricolage Grotesque", url: "/fonts/bricolage-grotesque-latin-700-normal.woff" },
  { id: "hanken", label: "Hanken Grotesk", url: "/fonts/hanken-grotesk-latin-700-normal.woff" },
];

const cache = new Map<FontId, Font>();
const pending = new Map<FontId, Promise<Font>>();

export function loadFont(id: FontId, fetchImpl: typeof fetch = fetch): Promise<Font> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(id);
  if (inflight) return inflight;

  const info = FONTS.find((f) => f.id === id);
  if (!info) return Promise.reject(new Error(`Unknown font: ${id}`));

  const promise = fetchImpl(info.url)
    .then((res) => {
      if (!res.ok) throw new Error(`Could not load font "${info.label}" (${res.status}).`);
      return res.arrayBuffer();
    })
    .then((buf) => {
      const font = parse(buf);
      cache.set(id, font);
      return font;
    })
    .finally(() => pending.delete(id));

  pending.set(id, promise);
  return promise;
}

/** Register a font that was parsed elsewhere. Used by tests. */
export function registerFont(id: FontId, font: Font): void {
  cache.set(id, font);
}

export interface TextOutline {
  d: string;
  width: number;
  height: number;
}

/**
 * Build segments from opentype.js commands and close every contour.
 *
 * This deliberately avoids `Path.toPathData()`: in opentype.js 2.0 it can emit
 * NaN for some strings (for example "Hello" in Lilita One) even though the raw
 * commands are fine.
 */
export function commandsToSegs(commands: readonly PathCommand[]): Seg[] {
  const segs: Seg[] = [];
  let open = false;
  for (const c of commands) {
    switch (c.type) {
      case "M":
        if (open) segs.push({ t: "Z" });
        segs.push({ t: "M", x: c.x!, y: c.y! });
        open = true;
        break;
      case "L":
        segs.push({ t: "L", x: c.x!, y: c.y! });
        break;
      case "Q":
        segs.push({ t: "Q", x1: c.x1!, y1: c.y1!, x: c.x!, y: c.y! });
        break;
      case "C":
        segs.push({ t: "C", x1: c.x1!, y1: c.y1!, x2: c.x2!, y2: c.y2!, x: c.x!, y: c.y! });
        break;
      case "Z":
        segs.push({ t: "Z" });
        open = false;
        break;
    }
  }
  if (open) segs.push({ t: "Z" });
  return segs;
}

/**
 * Convert text to outline path data in millimetres, with its bounding box
 * starting at (0, 0). `size` is the font size in mm. Multi-line text is
 * left-aligned.
 */
export function textOutline(font: Font, text: string, size: number, letterSpacing: number): TextOutline {
  const lines = text.split("\n");
  const lineHeight = size * 1.18;
  const scale = size / font.unitsPerEm;
  const segs: Seg[] = [];

  // Layout is done glyph by glyph through the character map. opentype.js's
  // string shaping (`stringToGlyphs`, `Font.getPath(text)`) throws on the
  // contextual substitution tables in Bricolage Grotesque and Hanken Grotesk,
  // and cutting does not need ligatures.
  lines.forEach((line, row) => {
    if (line.trim() === "") return;
    const baseline = row * lineHeight;
    const chars = Array.from(line);
    let x = 0;
    chars.forEach((ch, i) => {
      const glyph = font.charToGlyph(ch);
      if (ch.trim() !== "") segs.push(...commandsToSegs(glyph.getPath(x, baseline, size).commands));
      let kern = 0;
      if (i < chars.length - 1) {
        try {
          kern = font.getKerningValue(glyph, font.charToGlyph(chars[i + 1])) * scale;
        } catch {
          kern = 0; // Unsupported kerning table: fall back to plain advances.
        }
      }
      x += (glyph.advanceWidth ?? 0) * scale + kern + letterSpacing;
    });
  });

  if (segs.length === 0) return { d: "", width: 0, height: 0 };
  const normalized = normalizeSegs(segs);
  return { d: normalized.d, width: normalized.width, height: normalized.height };
}
