/**
 * CutDesk document model.
 *
 * All geometry is stored in millimetres. `unit` only changes how numbers are
 * displayed in the UI. Every object carries its own transform, applied in the
 * same order Konva and SVG use: translate, then rotate, then scale.
 */

export type Operation = "cut" | "score" | "draw" | "print";
export const OPERATIONS: readonly Operation[] = ["cut", "score", "draw", "print"];

export type Unit = "mm" | "in";

// The four bundled fonts, plus any uploaded custom font (its generated id).
export type FontId = "lilita" | "pacifico" | "bricolage" | "hanken" | (string & {});

export interface Transform {
  x: number;
  y: number;
  /** Degrees, clockwise. */
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export type Geometry =
  /** Origin at top-left. */
  | { kind: "rect"; width: number; height: number; cornerRadius: number }
  /** Origin at centre. */
  | { kind: "ellipse"; rx: number; ry: number }
  /** Free path. Bounding box starts at (0, 0). */
  | { kind: "path"; d: string }
  /**
   * Text, already converted to outlines so it can be cut. `d`, `width` and
   * `height` are derived from the other fields and cached in the document, so
   * a saved project never depends on a font being available.
   */
  | {
      kind: "text";
      text: string;
      fontId: FontId;
      size: number;
      letterSpacing: number;
      /** Curve the text along an arc of this many degrees (0 = straight). */
      arc?: number;
      d: string;
      width: number;
      height: number;
    }
  /** Reference artwork. Origin at top-left. Never cut. */
  | { kind: "image"; src: string; width: number; height: number };

export type GeometryKind = Geometry["kind"];

/**
 * Optional visual styling, independent of cut semantics. The cut path always
 * follows the geometry; `style` only changes how the object looks on screen and
 * in raster/PDF export, so the editor can be used as a design tool, not just a
 * cutter.
 */
export interface ObjectStyle {
  /** Hex fill colour; overrides the layer's material fill for display. */
  fill?: string;
  /** 0–1. */
  opacity?: number;
  /** Hex outline colour for display; replaces the operation outline. */
  stroke?: string;
  /** Outline width in millimetres (scales with zoom). */
  strokeWidth?: number;
  /** Soft drop shadow for display. */
  shadow?: boolean;
  /** Two-stop linear gradient fill; overrides the flat fill when set. */
  gradient?: { from: string; to: string; angle: number };
}

export interface DesignObject extends Transform {
  id: string;
  name: string;
  layerId: string;
  geo: Geometry;
  style?: ObjectStyle;
  /** Objects sharing a groupId select and move together. */
  groupId?: string;
  /** Locked objects can be selected (to unlock) but not moved, resized or deleted. */
  locked?: boolean;
  /** Hidden objects are not shown, selected, or cut. */
  hidden?: boolean;
}

export interface Layer {
  id: string;
  name: string;
  operation: Operation;
  /** Display colour. Cut layers show it as a material fill. */
  color: string;
  visible: boolean;
  locked: boolean;
}

export type MatPresetId = "cricut-12x12" | "cricut-12x24" | "a4" | "a3" | "custom";

export interface Mat {
  preset: MatPresetId;
  /** Millimetres. */
  width: number;
  height: number;
}

export interface Doc {
  name: string;
  unit: Unit;
  mat: Mat;
  /** Index 0 is the bottom layer. Object order within a layer is its z-order. */
  layers: Layer[];
  objects: DesignObject[];
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Point {
  x: number;
  y: number;
}
