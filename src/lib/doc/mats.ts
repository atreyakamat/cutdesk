import type { Mat, MatPresetId } from "./types";

export interface MatPreset {
  id: MatPresetId;
  label: string;
  width: number;
  height: number;
}

/** Sizes are the printed grid area, in millimetres. */
export const MAT_PRESETS: readonly MatPreset[] = [
  { id: "cricut-12x12", label: "12 × 12 in mat", width: 304.8, height: 304.8 },
  { id: "cricut-12x24", label: "12 × 24 in mat", width: 304.8, height: 609.6 },
  { id: "a4", label: "A4 sheet", width: 210, height: 297 },
  { id: "a3", label: "A3 sheet", width: 297, height: 420 },
];

export const MIN_MAT_MM = 20;
export const MAX_MAT_MM = 2000;

export function matFromPreset(id: Exclude<MatPresetId, "custom">): Mat {
  const preset = MAT_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown mat preset: ${id}`);
  return { preset: id, width: preset.width, height: preset.height };
}

/** Space the mat surface extends past the grid, used for the ruler numerals. */
export const MAT_GUTTER = { left: 10, top: 10, right: 4, bottom: 4 } as const;
