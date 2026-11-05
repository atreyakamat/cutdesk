import ImageTracer from "imagetracerjs";
import { normalizePath } from "../doc/pathData";
import {
  buildMask,
  dilate,
  fillHoles,
  maskArea,
  padMask,
  smoothMask,
  type MaskSource,
  type RawImage,
} from "./mask";

export type TraceMode = "outline" | "shapes";

export interface TraceOptions {
  mode: TraceMode;
  source: MaskSource;
  /** 0–255, used when the mask comes from darkness. */
  threshold: number;
  invert: boolean;
  /** Grow the outline by this many millimetres (outline mode). */
  offsetMm: number;
  /** Ignore holes inside the artwork so only the outside edge is cut (outline mode). */
  fillHoles: boolean;
  /** 0–10. Higher values give rounder, simpler curves. */
  smoothing: number;
  /** Final width of the image on the mat, in millimetres. */
  widthMm: number;
}

export interface TraceResult {
  /** Path data in pixel units of the padded frame, with its box starting at (0, 0). */
  d: string;
  /** Size of the traced path, in pixels. */
  pathWidth: number;
  pathHeight: number;
  /** Where the path's top-left sits inside the padded frame, in pixels. */
  originX: number;
  originY: number;
  /** Padding added around the source image, in pixels. */
  pad: number;
  /** Millimetres per pixel. */
  mmPerPx: number;
  /** Source image size in pixels (without padding). */
  imageWidth: number;
  imageHeight: number;
}

export class TraceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TraceError";
  }
}

const BLACK = { r: 0, g: 0, b: 0, a: 255 };
const WHITE = { r: 255, g: 255, b: 255, a: 255 };

/** Pull the dark path data out of ImageTracer's SVG string. */
export function extractBlackPaths(svg: string): string {
  const paths: string[] = [];
  const re = /<path\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const tag = m[0];
    const fill = /fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"/.exec(tag);
    const d = /\bd="([^"]+)"/.exec(tag);
    if (!fill || !d) continue;
    if (Number(fill[1]) < 128 && Number(fill[2]) < 128 && Number(fill[3]) < 128) paths.push(d[1].trim());
  }
  return paths.join(" ");
}

export function traceMaskToPath(mask: Uint8Array, width: number, height: number, smoothing: number): string {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < mask.length; i++) {
    const c = mask[i] ? BLACK : WHITE;
    rgba[i * 4] = c.r;
    rgba[i * 4 + 1] = c.g;
    rgba[i * 4 + 2] = c.b;
    rgba[i * 4 + 3] = 255;
  }

  // Higher smoothing raises the fit tolerances and the minimum speck size.
  const tol = 0.6 + smoothing * 0.35;
  const svg = ImageTracer.imagedataToSVG(
    { width, height, data: rgba },
    {
      ltres: tol,
      qtres: tol,
      pathomit: 12 + smoothing * 6,
      colorsampling: 0,
      numberofcolors: 2,
      pal: [BLACK, WHITE],
      colorquantcycles: 1,
      blurradius: 0,
      strokewidth: 0,
      linefilter: false,
      roundcoords: 2,
      scale: 1,
      viewbox: false,
      desc: false,
    },
  );
  return extractBlackPaths(svg);
}

/**
 * Turn artwork pixels into a single compound cut path.
 *
 * In outline mode the result is the silhouette grown by `offsetMm`, which is
 * what a sticker contour cut needs. In shapes mode it follows the dark areas
 * of the image, holes included.
 */
export function traceImage(img: RawImage, opts: TraceOptions): TraceResult {
  const mmPerPx = opts.widthMm / img.width;
  const offsetPx = opts.mode === "outline" ? Math.max(0, opts.offsetMm / mmPerPx) : 0;
  const pad = Math.ceil(offsetPx) + 4;

  let mask = buildMask(img, { source: opts.source, threshold: opts.threshold, invert: opts.invert });
  if (maskArea(mask) === 0) {
    throw new TraceError("No artwork found. Try a different threshold or switch the mask source.");
  }

  let width = img.width;
  let height = img.height;
  const padded = padMask(mask, width, height, pad);
  mask = padded.mask;
  width = padded.width;
  height = padded.height;

  if (opts.smoothing > 0) mask = smoothMask(mask, width, height, Math.min(4, opts.smoothing / 2.5));
  if (opts.mode === "outline" && opts.fillHoles) mask = fillHoles(mask, width, height);
  if (offsetPx > 0) mask = dilate(mask, width, height, offsetPx);

  const raw = traceMaskToPath(mask, width, height, opts.smoothing);
  if (!raw) throw new TraceError("Couldn't find any shapes to trace. Try lowering the smoothing.");

  const normalized = normalizePath(raw);
  if (!normalized.d) throw new TraceError("Couldn't find any shapes to trace.");

  return {
    d: normalized.d,
    pathWidth: normalized.width,
    pathHeight: normalized.height,
    originX: normalized.dx,
    originY: normalized.dy,
    pad,
    mmPerPx,
    imageWidth: img.width,
    imageHeight: img.height,
  };
}
