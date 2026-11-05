import { newId } from "./ids";
import { matFromPreset } from "./mats";
import type { Doc, Layer, Operation } from "./types";

/** Swatches offered for layer colours. The first is white vinyl. */
export const LAYER_COLORS = [
  "#FBFBF6",
  "#FFD43B",
  "#FF8FA3",
  "#4DABF7",
  "#69DB7C",
  "#B197FC",
  "#FFA94D",
  "#343A40",
] as const;

export const OPERATION_LABEL: Record<Operation, string> = {
  cut: "Cut",
  score: "Score",
  draw: "Draw",
  print: "Reference",
};

/** On-screen colours, tuned to read on the green mat. */
export const OPERATION_COLOR: Record<Operation, string> = {
  cut: "#C7211F",
  score: "#2455D6",
  draw: "#6D2FCB",
  print: "#566559",
};

/** Colours written to exported SVG, following the usual cutter convention. */
export const EXPORT_COLOR: Record<Operation, string> = {
  cut: "#FF0000",
  score: "#0000FF",
  draw: "#000000",
  print: "#808080",
};

export function createLayer(operation: Operation, name?: string, color?: string): Layer {
  return {
    id: newId(),
    name: name ?? OPERATION_LABEL[operation],
    operation,
    color: color ?? (operation === "cut" ? LAYER_COLORS[0] : LAYER_COLORS[7]),
    visible: true,
    locked: false,
  };
}

export function createDefaultDoc(): Doc {
  return {
    name: "Untitled design",
    unit: "mm",
    mat: matFromPreset("cricut-12x12"),
    layers: [createLayer("cut"), createLayer("score")],
    objects: [],
  };
}
