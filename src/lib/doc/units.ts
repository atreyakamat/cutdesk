import type { Unit } from "./types";

export const MM_PER_IN = 25.4;

export function fromMm(mm: number, unit: Unit): number {
  return unit === "in" ? mm / MM_PER_IN : mm;
}

export function toMm(value: number, unit: Unit): number {
  return unit === "in" ? value * MM_PER_IN : value;
}

/** Decimal places that read well for a unit. */
export function unitPrecision(unit: Unit): number {
  return unit === "in" ? 3 : 1;
}

/** "12.5" or "0.492", without trailing zeros. */
export function formatValue(mm: number, unit: Unit): string {
  const v = fromMm(mm, unit);
  return String(Number(v.toFixed(unitPrecision(unit))));
}

/** "12.5 mm" or "0.492 in". */
export function formatLength(mm: number, unit: Unit): string {
  return `${formatValue(mm, unit)} ${unit}`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
