/**
 * Tick generation for the canvas rulers. Pure and bounded: it picks a readable
 * "nice" step for the current zoom and never emits more than MAX_TICKS, so
 * extreme zoom can't hang or exhaust memory.
 */

export interface RulerTick {
  /** Position along the ruler, in screen pixels. */
  pos: number;
  label: string;
}

export interface RulerTicks {
  major: RulerTick[];
  minor: number[];
}

export interface RulerParams {
  /** Screen pixels per millimetre. */
  scale: number;
  /** Screen pixel where the mat origin (0 mm) sits. */
  origin: number;
  /** Ruler length in screen pixels. */
  length: number;
  unit: "mm" | "in";
}

export const MAX_TICKS = 2000;
const MIN_LABEL_PX = 56;
const MIN_MINOR_PX = 6;
const SUBDIVISIONS = 5;

/** Smallest 1/2/5 × 10^k that is ≥ `min`. Safe for junk input. */
export function niceStep(min: number): number {
  if (!(min > 0) || !Number.isFinite(min)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(min)));
  for (const m of [1, 2, 5]) if (m * pow >= min) return m * pow;
  return 10 * pow;
}

function formatLabel(v: number): string {
  // Values are multiples of a nice step, so a few decimals suffice.
  return String(Number(v.toFixed(3)));
}

export function rulerTicks({ scale, origin, length, unit }: RulerParams): RulerTicks {
  const empty: RulerTicks = { major: [], minor: [] };
  const perUnit = scale * (unit === "in" ? 25.4 : 1); // px per display unit
  if (!Number.isFinite(perUnit) || perUnit <= 0 || !Number.isFinite(length) || length <= 0 || !Number.isFinite(origin)) {
    return empty;
  }

  const step = niceStep(MIN_LABEL_PX / perUnit);
  const pxStep = step * perUnit;
  if (!Number.isFinite(pxStep) || pxStep <= 0) return empty;

  // Index range of major ticks whose screen position falls within [0, length].
  const kMin = Math.ceil((0 - origin) / pxStep);
  const kMax = Math.floor((length - origin) / pxStep);
  const major: RulerTick[] = [];
  for (let k = kMin; k <= kMax && major.length < MAX_TICKS; k++) {
    major.push({ pos: origin + k * pxStep, label: formatLabel(k * step) });
  }

  const minor: number[] = [];
  const minorPx = pxStep / SUBDIVISIONS;
  if (minorPx >= MIN_MINOR_PX) {
    const mMin = Math.ceil((0 - origin) / minorPx);
    const mMax = Math.floor((length - origin) / minorPx);
    for (let m = mMin; m <= mMax && minor.length < MAX_TICKS; m++) {
      if (m % SUBDIVISIONS !== 0) minor.push(origin + m * minorPx); // skip where a major sits
    }
  }

  return { major, minor };
}
