"use client";

import type Konva from "konva";
import { memo } from "react";
import { Ellipse, Image as KImage, Path, Rect } from "react-konva";
import { OPERATION_COLOR } from "@/lib/doc/defaults";
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

function ImageNode({ obj, common }: { obj: DesignObject; common: Record<string, unknown> }) {
  const geo = obj.geo;
  const image = useLoadedImage(geo.kind === "image" ? geo.src : "");
  if (geo.kind !== "image" || !image) return null;
  return <KImage {...common} image={image} width={geo.width} height={geo.height} />;
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
  };

  const outline =
    layer.operation === "print"
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

  switch (geo.kind) {
    case "rect":
      return <Rect {...common} {...outline} fill={fill} width={geo.width} height={geo.height} cornerRadius={geo.cornerRadius} />;
    case "ellipse":
      return <Ellipse {...common} {...outline} fill={fill} radiusX={geo.rx} radiusY={geo.ry} />;
    case "path":
    case "text":
      return <Path {...common} {...outline} fill={fill} data={geo.d} />;
    case "image":
      return <ImageNode obj={obj} common={common} />;
  }
});
