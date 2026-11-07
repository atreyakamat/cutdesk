#!/usr/bin/env node
/**
 * Build a CutDesk gallery catalog.json from a folder of assets.
 *
 *   node scripts/build-catalog.mjs --in ./assets --out ./catalog.json \
 *        --base-url https://cdn.stixnvibes.com/designs --name "Stix N Vibes"
 *
 * SVGs become cut-ready "path" items: their geometry is extracted, moved to a
 * (0,0) origin and scaled so the longest side is --size mm (default 60). An SVG
 * that uses transforms or has no plain geometry falls back to an "image" item.
 * PNG/JPG/WEBP become "image" items (traced in the app). A sub-folder name is
 * used as the item's category.
 *
 * Image items need an absolute, CORS-enabled URL, so pass --base-url; it is
 * prefixed to each image's path relative to --in.
 *
 * Run `npm install` in this folder once first (installs svgpath + bounds).
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, posix, sep } from "node:path";
import svgpath from "svgpath";
import pathBounds from "svg-path-bounds";

function parseArgs(argv) {
  const args = { in: "./assets", out: "./catalog.json", "base-url": "", name: "CutDesk catalog", size: 60 };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    if (key in args) args[key] = key === "size" ? Number(argv[++i]) : argv[++i];
  }
  return args;
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

// --- SVG basic-shape → path conversions ---------------------------------------
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  return m ? m[1] : null;
};
const numsFrom = (s) => (s ?? "").trim().split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n));

function shapeToPath(tag, kind) {
  const n = (name, def = 0) => Number(attr(tag, name) ?? def);
  if (kind === "rect") {
    const x = n("x"), y = n("y"), w = n("width"), h = n("height");
    if (w <= 0 || h <= 0) return null;
    return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
  }
  if (kind === "circle") {
    const cx = n("cx"), cy = n("cy"), r = n("r");
    if (r <= 0) return null;
    return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  }
  if (kind === "ellipse") {
    const cx = n("cx"), cy = n("cy"), rx = n("rx"), ry = n("ry");
    if (rx <= 0 || ry <= 0) return null;
    return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
  }
  if (kind === "line") {
    const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((a) => n(a));
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  if (kind === "polygon" || kind === "polyline") {
    const pts = numsFrom(attr(tag, "points"));
    if (pts.length < 4) return null;
    let d = `M ${pts[0]} ${pts[1]}`;
    for (let i = 2; i + 1 < pts.length; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`;
    return kind === "polygon" ? d + " Z" : d;
  }
  return null;
}

/** Pull combined path data from an SVG, or null to fall back to an image item. */
function svgToPathData(svg) {
  if (/transform\s*=/.test(svg)) return null; // transforms need a real DOM; be safe
  const parts = [];
  for (const m of svg.matchAll(/<path\b[^>]*\bd\s*=\s*"([^"]+)"[^>]*>/g)) parts.push(m[1]);
  for (const kind of ["rect", "circle", "ellipse", "line", "polygon", "polyline"]) {
    for (const m of svg.matchAll(new RegExp(`<${kind}\\b[^>]*>`, "g"))) {
      const d = shapeToPath(m[0], kind);
      if (d) parts.push(d);
    }
  }
  if (parts.length === 0) return null;
  return parts.join(" ");
}

function normalizePath(d, sizeMm) {
  let bounds;
  try {
    bounds = pathBounds(d);
  } catch {
    return null;
  }
  const [minX, minY, maxX, maxY] = bounds;
  const w = maxX - minX;
  const h = maxY - minY;
  if (!(w > 0) && !(h > 0)) return null;
  const scale = sizeMm / Math.max(w || 1, h || 1);
  // CutDesk's path parser renders arcs as straight lines, so expand them to
  // cubic beziers (unarc); circles/rounded shapes then cut as real curves.
  const out = svgpath(d).translate(-minX, -minY).scale(scale).unarc().round(3).toString();
  return { d: out, width: Number((w * scale).toFixed(2)), height: Number((h * scale).toFixed(2)) };
}

function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// --- Walk the input folder ----------------------------------------------------
const args = parseArgs(process.argv);
const sizeMm = Number.isFinite(args.size) && args.size > 0 ? args.size : 60;
const baseUrl = String(args["base-url"]).replace(/\/+$/, "");
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

let files;
try {
  files = readdirSync(args.in, { recursive: true, withFileTypes: true });
} catch {
  console.error(`Couldn't read input folder: ${args.in}`);
  process.exit(1);
}

const items = [];
let paths = 0;
let images = 0;
let skipped = 0;

for (const entry of files) {
  if (!entry.isFile()) continue;
  const dir = entry.parentPath ?? entry.path ?? args.in;
  const full = join(dir, entry.name);
  const rel = full.slice(args.in.replace(/\/+$/, "").length + 1);
  const ext = extname(entry.name).toLowerCase();
  const name = basename(entry.name, extname(entry.name));
  const category = rel.includes(sep) ? rel.split(sep)[0] : undefined;
  const id = slug(rel.replace(/\.[^.]+$/, ""));
  const relUrl = rel.split(sep).join(posix.sep);

  try {
    if (ext === ".svg") {
      const svg = readFileSync(full, "utf8");
      const d = svgToPathData(svg);
      const norm = d ? normalizePath(d, sizeMm) : null;
      if (norm) {
        items.push({ id, name, ...(category ? { category } : {}), type: "path", d: norm.d, width: norm.width, height: norm.height });
        paths++;
        continue;
      }
      // Fallback: ship the SVG as an image to trace.
      if (baseUrl) {
        items.push({ id, name, ...(category ? { category } : {}), type: "image", url: `${baseUrl}/${relUrl}` });
        images++;
      } else skipped++;
    } else if (IMAGE_EXT.has(ext)) {
      if (!baseUrl) {
        skipped++;
        continue;
      }
      const size = ext === ".png" ? pngSize(readFileSync(full)) : null;
      items.push({ id, name, ...(category ? { category } : {}), type: "image", url: `${baseUrl}/${relUrl}`, ...(size ?? {}) });
      images++;
    }
  } catch (err) {
    console.warn(`Skipped ${rel}: ${err.message}`);
    skipped++;
  }
}

const catalog = { version: 1, name: args.name, items };
writeFileSync(args.out, JSON.stringify(catalog, null, 2) + "\n");

console.log(`Wrote ${items.length} items to ${args.out}  (${paths} cut paths, ${images} images, ${skipped} skipped).`);
if (skipped > 0 && !baseUrl) console.log("Tip: pass --base-url to include image/raster assets (they need an absolute, CORS-enabled URL).");
