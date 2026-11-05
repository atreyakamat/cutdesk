"use client";

import { Maximize, Minus, Plus, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { objectsOutsideMat } from "@/lib/doc/cutPlan";
import { formatValue } from "@/lib/doc/units";
import { useEditor } from "@/store/editorStore";
import { IconButton } from "./ui/IconButton";

const PX_PER_MM_AT_100 = 96 / 25.4;

export function StatusBar() {
  const doc = useEditor((s) => s.doc);
  const cursor = useEditor((s) => s.cursor);
  const scale = useEditor((s) => s.view.scale);
  const viewport = useEditor((s) => s.viewport);
  const selectionCount = useEditor((s) => s.selection.length);
  const zoomAt = useEditor((s) => s.zoomAt);
  const fitView = useEditor((s) => s.fitView);

  const outside = useMemo(() => objectsOutsideMat(doc).length, [doc]);
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
      <div className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-pop bg-panel/90 px-3 py-1.5 text-xs text-ink-soft shadow-pop backdrop-blur">
        <span className="tabular-nums" aria-label="Pointer position">
          {cursor ? `${formatValue(cursor.x, doc.unit)}, ${formatValue(cursor.y, doc.unit)} ${doc.unit}` : `0, 0 ${doc.unit}`}
        </span>
        <span>
          {doc.objects.length} {doc.objects.length === 1 ? "object" : "objects"}
          {selectionCount > 0 ? `, ${selectionCount} selected` : ""}
        </span>
        {outside > 0 && (
          <span role="status" className="flex items-center gap-1.5 font-medium text-blade">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            {outside} past the edge of the mat
          </span>
        )}
      </div>

      <div className="pointer-events-auto flex items-center rounded-pop bg-panel/90 p-0.5 shadow-pop backdrop-blur">
        <IconButton icon={Minus} label="Zoom out" shortcut="-" size="sm" tipSide="top" onClick={() => zoomAt(0.8, cx, cy)} />
        <span className="w-12 text-center text-xs tabular-nums text-ink-soft" aria-label="Zoom level">
          {Math.round((scale / PX_PER_MM_AT_100) * 100)}%
        </span>
        <IconButton icon={Plus} label="Zoom in" shortcut="+" size="sm" tipSide="top" onClick={() => zoomAt(1.25, cx, cy)} />
        <IconButton icon={Maximize} label="Fit mat to screen" shortcut="Ctrl 0" size="sm" tipSide="top" onClick={fitView} />
      </div>
    </div>
  );
}
