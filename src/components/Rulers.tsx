"use client";

import { rulerTicks } from "@/lib/ui/ruler";
import { useEditor } from "@/store/editorStore";

const R = 18; // ruler thickness, px

/**
 * Top and left rulers synced to the view. Click a ruler to drop a guide at that
 * position; double-click a ruler to clear all guides. Guides snap like any other
 * alignment line.
 */
export function Rulers() {
  const show = useEditor((s) => s.showRulers);
  const view = useEditor((s) => s.view);
  const viewport = useEditor((s) => s.viewport);
  const unit = useEditor((s) => s.doc.unit);
  const addGuide = useEditor((s) => s.addGuide);
  const clearGuides = useEditor((s) => s.clearGuides);

  if (!show || viewport.width === 0) return null;

  const top = rulerTicks({ scale: view.scale, origin: view.tx, length: viewport.width, unit });
  const left = rulerTicks({ scale: view.scale, origin: view.ty, length: viewport.height, unit });

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* Top ruler */}
      <svg
        width={viewport.width}
        height={R}
        className="pointer-events-auto absolute left-0 top-0 cursor-crosshair"
        onClick={(e) => addGuide("x", (e.nativeEvent.offsetX - view.tx) / view.scale)}
        onDoubleClick={clearGuides}
        aria-label="Horizontal ruler — click to add a guide"
      >
        <rect x={0} y={0} width={viewport.width} height={R} className="fill-panel stroke-line" strokeWidth={1} />
        {top.minor.map((p, i) => (
          <line key={`m${i}`} x1={p} y1={R - 4} x2={p} y2={R} className="stroke-line-strong" strokeWidth={1} />
        ))}
        {top.major.map((t, i) => (
          <g key={`M${i}`}>
            <line x1={t.pos} y1={R - 8} x2={t.pos} y2={R} className="stroke-ink-faint" strokeWidth={1} />
            <text x={t.pos + 2} y={9} className="fill-ink-soft" style={{ fontSize: 9 }}>
              {t.label}
            </text>
          </g>
        ))}
      </svg>

      {/* Left ruler */}
      <svg
        width={R}
        height={viewport.height}
        className="pointer-events-auto absolute left-0 top-0 cursor-crosshair"
        onClick={(e) => addGuide("y", (e.nativeEvent.offsetY - view.ty) / view.scale)}
        onDoubleClick={clearGuides}
        aria-label="Vertical ruler — click to add a guide"
      >
        <rect x={0} y={0} width={R} height={viewport.height} className="fill-panel stroke-line" strokeWidth={1} />
        {left.minor.map((p, i) => (
          <line key={`m${i}`} x1={R - 4} y1={p} x2={R} y2={p} className="stroke-line-strong" strokeWidth={1} />
        ))}
        {left.major.map((t, i) => (
          <g key={`M${i}`}>
            <line x1={R - 8} y1={t.pos} x2={R} y2={t.pos} className="stroke-ink-faint" strokeWidth={1} />
            <text x={9} y={t.pos - 2} transform={`rotate(-90 9 ${t.pos - 2})`} className="fill-ink-soft" style={{ fontSize: 9 }}>
              {t.label}
            </text>
          </g>
        ))}
      </svg>

      {/* Corner */}
      <div className="absolute left-0 top-0 border-b border-r border-line bg-panel" style={{ width: R, height: R }} />
    </div>
  );
}
