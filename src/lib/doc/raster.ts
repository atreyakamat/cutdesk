/**
 * A "visual" SVG — what the design looks like, not what the machine cuts. Unlike
 * the cut export, shapes are painted with their per-object fill (or the layer's
 * material colour) and their opacity, so it can be rasterised to a PNG or placed
 * in a PDF. This module is pure; the browser rasterisation lives in files.ts.
 */

import { OPERATION_COLOR } from "./defaults";
import { worldSegs } from "./geometry";
import { serializePath } from "./pathData";
import type { Doc } from "./types";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function num(n: number): string {
  const v = Number(n.toFixed(3));
  return String(Object.is(v, -0) ? 0 : v);
}

export interface VisualOptions {
  /** Page background; omit (or "transparent") for a transparent PNG. */
  background?: string;
}

export function exportVisualSvg(doc: Doc, options: VisualOptions = {}): string {
  const { width, height } = doc.mat;
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}mm" height="${num(height)}mm" ` +
      `viewBox="0 0 ${num(width)} ${num(height)}">`,
  );
  out.push(`  <title>${escapeXml(doc.name)}</title>`);
  if (options.background && options.background !== "transparent") {
    out.push(`  <rect x="0" y="0" width="${num(width)}" height="${num(height)}" fill="${escapeXml(options.background)}"/>`);
  }

  // Bottom layer first, matching the on-screen stacking order.
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    for (const obj of doc.objects) {
      if (obj.layerId !== layer.id) continue;
      const opacity = obj.style?.opacity;
      const op = opacity !== undefined && opacity < 1 ? ` opacity="${num(opacity)}"` : "";

      if (obj.geo.kind === "image") {
        const t = `translate(${num(obj.x)} ${num(obj.y)}) rotate(${num(obj.rotation)}) scale(${num(obj.scaleX)} ${num(obj.scaleY)})`;
        out.push(
          `  <image href="${obj.geo.src}" width="${num(obj.geo.width)}" height="${num(obj.geo.height)}" transform="${t}"${op}/>`,
        );
        continue;
      }

      const segs = worldSegs(obj);
      if (!segs || segs.length === 0) continue;
      const fill = obj.style?.fill ?? (layer.operation === "cut" ? layer.color : "none");
      // Keep the operation outline when there's no design fill, so score/draw
      // shapes stay visible and cut shapes read as they do in the editor.
      const stroke = layer.operation !== "print" && !obj.style?.fill ? OPERATION_COLOR[layer.operation] : "none";
      const strokeAttr = stroke === "none" ? "" : ` stroke="${stroke}" stroke-width="0.3" stroke-linejoin="round"`;
      out.push(`  <path d="${serializePath(segs, 3)}" fill="${fill}"${strokeAttr}${op}/>`);
    }
  }

  out.push("</svg>");
  return out.join("\n") + "\n";
}

/** Pixel size for a mat at the given DPI, with the longest side capped. */
export function rasterSize(doc: Doc, dpi = 300, maxSide = 4000): { width: number; height: number } {
  const pxPerMm = dpi / 25.4;
  let w = Math.round(doc.mat.width * pxPerMm);
  let h = Math.round(doc.mat.height * pxPerMm);
  const longest = Math.max(w, h);
  if (longest > maxSide) {
    const k = maxSide / longest;
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  return { width: Math.max(1, w), height: Math.max(1, h) };
}
