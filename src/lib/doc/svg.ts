import { EXPORT_COLOR } from "./defaults";
import { worldSegs } from "./geometry";
import { serializePath } from "./pathData";
import type { Doc, Operation } from "./types";

export interface ExportOptions {
  /** Operations to include. Defaults to every operation. */
  operations?: readonly Operation[];
  /** Include reference artwork when exporting everything. Default true. */
  includeReference?: boolean;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function num(n: number): string {
  const v = Number(n.toFixed(3));
  return String(Object.is(v, -0) ? 0 : v);
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "design"
  );
}

/**
 * Serialise the design as a plain SVG sized in millimetres.
 *
 * Paths are written with their transforms applied, so the file contains no
 * `transform` attributes on cut, score or draw geometry. That keeps it
 * compatible with cutter software that handles transforms poorly. Layers
 * become `<g>` groups tagged with `data-operation`.
 */
export function exportSvg(doc: Doc, options: ExportOptions = {}): string {
  const ops = new Set<Operation>(options.operations ?? ["cut", "score", "draw", "print"]);
  if (options.includeReference === false) ops.delete("print");

  const { width, height } = doc.mat;
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${num(width)}mm" height="${num(height)}mm" viewBox="0 0 ${num(width)} ${num(height)}">`,
  );
  out.push(`  <title>${escapeXml(doc.name)}</title>`);

  for (const layer of doc.layers) {
    if (!layer.visible || !ops.has(layer.operation)) continue;
    const objects = doc.objects.filter((o) => o.layerId === layer.id);
    if (objects.length === 0) continue;

    const color = EXPORT_COLOR[layer.operation];
    const attrs =
      layer.operation === "print"
        ? ""
        : ` fill="none" stroke="${color}" stroke-width="0.1" stroke-linejoin="round" stroke-linecap="round"`;
    out.push(
      `  <g id="${escapeXml(`layer-${slugify(layer.name)}-${layer.id}`)}" data-name="${escapeXml(layer.name)}" ` +
        `data-operation="${layer.operation}"${attrs}>`,
    );

    for (const obj of objects) {
      if (obj.geo.kind === "image") {
        const t = `translate(${num(obj.x)} ${num(obj.y)}) rotate(${num(obj.rotation)}) scale(${num(obj.scaleX)} ${num(obj.scaleY)})`;
        out.push(
          `    <image href="${obj.geo.src}" width="${num(obj.geo.width)}" height="${num(obj.geo.height)}" ` +
            `transform="${t}" data-name="${escapeXml(obj.name)}"/>`,
        );
        continue;
      }
      const segs = worldSegs(obj);
      if (!segs || segs.length === 0) continue;
      out.push(`    <path d="${serializePath(segs, 3)}" data-name="${escapeXml(obj.name)}"/>`);
    }
    out.push("  </g>");
  }

  out.push("</svg>");
  return out.join("\n") + "\n";
}

export type ExportKind = "all" | "cut" | "score" | "draw";

export function exportFileName(doc: Doc, kind: ExportKind): string {
  return `${slugify(doc.name)}${kind === "all" ? "" : `-${kind}`}.svg`;
}
