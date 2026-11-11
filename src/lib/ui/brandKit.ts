/**
 * A brand kit: reusable brand colours saved per-browser and applied across
 * designs (fill or stroke). Everything read back is validated, because the
 * values reach on-screen styles and SVG/PNG/PDF export.
 */

const KEY = "cutdesk:brand:v1";
export const MAX_BRAND_COLORS = 40;
const HEX = /^#[0-9a-fA-F]{6}$/;

export function normalizeHex(hex: string): string | null {
  return HEX.test(hex) ? hex.toLowerCase() : null;
}

/** Pure: prepend a validated colour, de-duplicated (case-insensitive) and capped. */
export function addColor(list: readonly string[], hex: string): string[] {
  const c = normalizeHex(hex);
  if (!c) return [...list];
  return [c, ...list.filter((x) => x.toLowerCase() !== c)].slice(0, MAX_BRAND_COLORS);
}

/** Pure: drop a colour (case-insensitive). */
export function removeColor(list: readonly string[], hex: string): string[] {
  const c = hex.toLowerCase();
  return list.filter((x) => x.toLowerCase() !== c);
}

function read(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string" && HEX.test(x)) : [];
  } catch {
    return [];
  }
}

function write(list: string[]): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage unavailable/full — nothing to do
  }
}

export function listBrandColors(): string[] {
  return read();
}

export function saveBrandColor(hex: string): string[] {
  const list = addColor(read(), hex);
  write(list);
  return list;
}

export function deleteBrandColor(hex: string): string[] {
  const list = removeColor(read(), hex);
  write(list);
  return list;
}
