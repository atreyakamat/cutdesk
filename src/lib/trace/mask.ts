/**
 * Binary mask helpers for turning artwork into cut paths. A mask is a
 * Uint8Array of width × height where 1 means "solid" and 0 means "empty".
 * Everything here is pure and works without a DOM.
 */

export interface RawImage {
  width: number;
  height: number;
  /** RGBA bytes, like ImageData.data. */
  data: ArrayLike<number>;
}

export type MaskSource = "auto" | "alpha" | "darkness";

export interface MaskOptions {
  /** Where "solid" comes from. "auto" uses transparency when the image has any. */
  source: MaskSource;
  /** 0–255. For "darkness": pixels darker than this are solid. */
  threshold: number;
  /** Swap solid and empty (applies after thresholding). */
  invert: boolean;
}

/** True when any pixel is meaningfully transparent. */
export function hasTransparency(img: RawImage): boolean {
  const { data } = img;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true;
  }
  return false;
}

export function buildMask(img: RawImage, opts: MaskOptions): Uint8Array {
  const { width, height, data } = img;
  const mask = new Uint8Array(width * height);
  const useAlpha = opts.source === "alpha" || (opts.source === "auto" && hasTransparency(img));

  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    const a = data[i + 3];
    let solid: boolean;
    if (useAlpha) {
      solid = a > 24;
    } else {
      // Rec. 601 luma. Transparent pixels never count as dark.
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      solid = a > 127 && luma < opts.threshold;
    }
    mask[p] = (opts.invert ? !solid : solid) ? 1 : 0;
  }
  return mask;
}

/** Pad a mask with empty pixels on every side so offsets don't clip. */
export function padMask(mask: Uint8Array, width: number, height: number, pad: number): { mask: Uint8Array; width: number; height: number } {
  const w = width + pad * 2;
  const h = height + pad * 2;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < height; y++) {
    out.set(mask.subarray(y * width, (y + 1) * width), (y + pad) * w + pad);
  }
  return { mask: out, width: w, height: h };
}

/** Turn every empty region that doesn't touch the border into solid. */
export function fillHoles(mask: Uint8Array, width: number, height: number): Uint8Array {
  const reached = new Uint8Array(mask.length);
  const stack: number[] = [];

  const push = (x: number, y: number) => {
    const i = y * width + x;
    if (mask[i] === 0 && reached[i] === 0) {
      reached[i] = 1;
      stack.push(i);
    }
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }

  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = reached[i] ? 0 : 1;
  return out;
}

const FAR = 1e20;

/** Felzenszwalb & Huttenlocher squared distance transform, one dimension. */
function distance1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/**
 * Grow the solid region by `radius` pixels using an exact Euclidean distance
 * transform, so the offset is round rather than square.
 */
export function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice();

  const grid = new Float64Array(width * height);
  for (let i = 0; i < mask.length; i++) grid[i] = mask[i] ? 0 : FAR;

  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);

  // Columns, then rows.
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x];
    distance1d(f, height, d, v, z);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = grid[y * width + x];
    distance1d(f, width, d, v, z);
    for (let x = 0; x < width; x++) grid[y * width + x] = d[x];
  }

  const r2 = radius * radius;
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = grid[i] <= r2 ? 1 : 0;
  return out;
}

/** Box-blur then re-threshold. Rounds jagged corners and drops specks. */
export function smoothMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const r = Math.round(radius);
  if (r <= 0) return mask.slice();

  const horizontal = new Float32Array(mask.length);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const row = y * width;
    for (let x = -r; x <= r; x++) sum += mask[row + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      horizontal[row + x] = sum / (2 * r + 1);
      sum += mask[row + Math.min(width - 1, x + r + 1)] - mask[row + Math.max(0, x - r)];
    }
  }

  const out = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += horizontal[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / (2 * r + 1) >= 0.5 ? 1 : 0;
      sum += horizontal[Math.min(height - 1, y + r + 1) * width + x] - horizontal[Math.max(0, y - r) * width + x];
    }
  }
  return out;
}

export function maskArea(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return n;
}
