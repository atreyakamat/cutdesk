/**
 * Numbers and letters as cut paths, generated from the bundled fonts with the
 * same text-to-outline pipeline the editor uses. Produces 0–9, A–Z and a–z in
 * every bundled font — real glyph geometry, ready to cut. Generated on demand
 * (fonts are fetched + cached) rather than bundled, so it stays out of the
 * initial download.
 */

import { FONTS, loadFont, textOutline } from "@/lib/text/fonts";
import type { GalleryShape } from "./catalog";

export const GLYPHS_CATEGORY = "Numbers & Letters";

const DIGITS = "0123456789";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const CHARS = Array.from(DIGITS + UPPER + LOWER);

export async function generateGlyphs(): Promise<GalleryShape[]> {
  const shapes: GalleryShape[] = [];
  for (const info of FONTS) {
    let font;
    try {
      font = await loadFont(info.id);
    } catch {
      continue; // Skip a font that fails to load rather than fail the whole set.
    }
    for (const ch of CHARS) {
      const outline = textOutline(font, ch, 40, 0);
      if (!outline.d || outline.width <= 0 || outline.height <= 0) continue;
      shapes.push({
        id: `glyph-${info.id}-${ch}`,
        name: `${ch} · ${info.label}`,
        category: GLYPHS_CATEGORY,
        d: outline.d,
        width: outline.width,
        height: outline.height,
      });
    }
  }
  return shapes;
}
