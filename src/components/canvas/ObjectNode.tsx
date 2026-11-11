"use client";

import type Konva from "konva";
import { memo } from "react";
import { Ellipse, Image as KImage, Path, Rect } from "react-konva";
import { OPERATION_COLOR } from "@/lib/doc/defaults";
import { localBBox } from "@/lib/doc/geometry";
import type { DesignObject, Layer } from "@/lib/doc/types";
import { useLoadedImage } from "./useLoadedImage";

export type DragHandler = (e: Konva.KonvaEventObject<DragEvent>) => void;

interface Props {
  obj: DesignObject;
  layer: Layer;
  draggable: boolean;
  onDragStart: DragHandler;
  onDragMove: DragHandler;
  onDragEnd: DragHandler;
}

function ImageNode({ obj, common, outline }: { obj: DesignObject; common: Record<string, unknown>; outline: Record<string, unknown> }) {
  const geo = obj.geo;
  const image = useLoadedImage(geo.kind === "image" ? geo.src : "");
  if (geo.kind !== "image" || !image) return null;
  // Images carry no operation outline; only a design stroke, if set, applies.
  const stroke = obj.style?.stroke ? outline : {};
  return <KImage {...common} {...stroke} image={image} width={geo.width} height={geo.height} />;
}

/**
 * One design object on the canvas. Cut shapes show the layer colour as a
 * material fill with a blade-red outline; score and draw shapes are outline
 * only, so clicking inside them still reaches whatever sits underneath.
 */
export const ObjectNode = memo(function ObjectNode({ obj, layer, draggable, onDragStart, onDragMove, onDragEnd }: Props) {
  const common = {
    id: obj.id,
    name: "obj",
    x: obj.x,
    y: obj.y,
    rotation: obj.rotation,
    scaleX: obj.scaleX,
    scaleY: obj.scaleY,
    opacity: obj.style?.opacity ?? 1,
    draggable: draggable && !layer.locked && !obj.locked,
    listening: !layer.locked,
    onDragStart,
    onDragMove,
    onDragEnd,
    ...(obj.style?.shadow
      ? { shadowColor: "#000000", shadowBlur: 10, shadowOpacity: 0.28, shadowOffsetY: 3 }
      : {}),
  };

  // A design stroke (colour + mm width, scales with zoom) replaces the operation
  // outline for display; the cut geometry itself is unchanged either way.
  const designStroke = obj.style?.stroke;
  const outline = designStroke
    ? {
        stroke: designStroke,
        strokeWidth: obj.style?.strokeWidth ?? 1,
        strokeScaleEnabled: true,
        hitStrokeWidth: 10,
        lineJoin: "round" as const,
      }
    : layer.operation === "print"
      ? {}
      : {
          stroke: OPERATION_COLOR[layer.operation],
          strokeWidth: layer.operation === "cut" ? 1.6 : 1.4,
          strokeScaleEnabled: false,
          hitStrokeWidth: 10,
          lineJoin: "round" as const,
          dash: layer.operation === "score" ? [6, 4] : undefined,
        };
  // A per-object fill (design styling) wins; otherwise cut layers show their
  // material colour and score/draw stay outline-only.
  const fill = obj.style?.fill ?? (layer.operation === "cut" ? layer.color : undefined);
  const geo = obj.geo;

  // A linear gradient fill (display) overrides the flat fill, spanning the
  // shape's local bounding box at the chosen angle.
  const grad = obj.style?.gradient;
  let gradient: Record<string, unknown> = {};
  if (grad && geo.kind !== "image") {
    const bb = localBBox(geo);
    if (bb) {
      const rad = (grad.angle * Math.PI) / 180;
      const cx = (bb.minX + bb.maxX) / 2;
      const cy = (bb.minY + bb.maxY) / 2;
      const hw = (bb.maxX - bb.minX) / 2;
      const hh = (bb.maxY - bb.minY) / 2;
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);
      gradient = {
        fillPriority: "linear-gradient",
        fillLinearGradientStartPoint: { x: cx - dx * hw, y: cy - dy * hh },
        fillLinearGradientEndPoint: { x: cx + dx * hw, y: cy + dy * hh },
        fillLinearGradientColorStops: [0, grad.from, 1, grad.to],
      };
    }
  }

  switch (geo.kind) {
    case "rect":
      return <Rect {...common} {...outline} fill={fill} {...gradient} width={geo.width} height={geo.height} cornerRadius={geo.cornerRadius} />;
    case "ellipse":
      return <Ellipse {...common} {...outline} fill={fill} {...gradient} radiusX={geo.rx} radiusY={geo.ry} />;
    case "path":
    case "text":
      return <Path {...common} {...outline} fill={fill} {...gradient} data={geo.d} />;
    case "image":
      return <ImageNode obj={obj} common={common} outline={outline} />;
  }
});
