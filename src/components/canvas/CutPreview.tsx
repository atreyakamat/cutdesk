"use client";

import type Konva from "konva";
import { useEffect, useMemo, useRef } from "react";
import { Circle, Group, Layer, Line, Shape } from "react-konva";
import { buildCutPlan, pointAtDistance, type CutPlan } from "@/lib/doc/cutPlan";
import { OPERATION_COLOR } from "@/lib/doc/defaults";
import { clamp } from "@/lib/doc/units";
import { useEditor } from "@/store/editorStore";

const OPS = ["draw", "score", "cut"] as const;

/** Seconds the animation takes. Real cutting time depends on the machine, so this is only for show. */
export function previewDuration(plan: CutPlan): number {
  return clamp(plan.totalLength / 150, 3, 12);
}

/**
 * Replays the cutting order: the blade tip travels along every pass in the
 * order a machine would follow, leaving a coloured line behind it. Drawing
 * bypasses React state, so it stays smooth on large designs.
 */
export function CutPreviewLayer({ runId, onFinished }: { runId: number; onFinished: () => void }) {
  const doc = useEditor((s) => s.doc);
  const scale = useEditor((s) => s.view.scale);
  const plan = useMemo(() => buildCutPlan(doc), [doc]);

  const progress = useRef(0);
  const bladeRef = useRef<Konva.Group>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const finished = useRef(onFinished);
  useEffect(() => {
    finished.current = onFinished;
  });

  useEffect(() => {
    progress.current = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 0 : previewDuration(plan) * 1000;
    const start = performance.now();
    let raf = 0;

    const paint = () => {
      const tip = pointAtDistance(plan, progress.current);
      if (tip && bladeRef.current) bladeRef.current.position(tip);
      layerRef.current?.batchDraw();
    };

    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      progress.current = t * plan.totalLength;
      paint();
      if (t < 1) raf = requestAnimationFrame(tick);
      else finished.current();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [plan, runId]);

  const r = 5 / scale;

  return (
    <Layer ref={layerRef} listening={false}>
      {OPS.map((op) => (
        <Shape
          key={op}
          stroke={OPERATION_COLOR[op]}
          strokeWidth={op === "cut" ? 2.6 : 2.2}
          strokeScaleEnabled={false}
          lineCap="round"
          lineJoin="round"
          sceneFunc={(ctx, shape) => {
            const reach = progress.current;
            ctx.beginPath();
            for (const pass of plan.passes) {
              if (pass.operation !== op) continue;
              if (pass.start >= reach) break;
              let left = reach - pass.start;
              const pts = pass.points;
              ctx.moveTo(pts[0].x, pts[0].y);
              for (let i = 1; i < pts.length; i++) {
                const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
                if (left >= len) {
                  ctx.lineTo(pts[i].x, pts[i].y);
                  left -= len;
                } else {
                  const t = len === 0 ? 0 : left / len;
                  ctx.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t);
                  break;
                }
              }
            }
            ctx.fillStrokeShape(shape);
          }}
        />
      ))}
      <Group ref={bladeRef}>
        <Circle radius={r} fill="#ffffff" stroke="#17251e" strokeWidth={1.6} strokeScaleEnabled={false} />
        <Line points={[-r * 1.9, 0, -r * 0.6, 0]} stroke="#17251e" strokeWidth={1.4} strokeScaleEnabled={false} />
        <Line points={[r * 0.6, 0, r * 1.9, 0]} stroke="#17251e" strokeWidth={1.4} strokeScaleEnabled={false} />
        <Line points={[0, -r * 1.9, 0, -r * 0.6]} stroke="#17251e" strokeWidth={1.4} strokeScaleEnabled={false} />
        <Line points={[0, r * 0.6, 0, r * 1.9]} stroke="#17251e" strokeWidth={1.4} strokeScaleEnabled={false} />
      </Group>
    </Layer>
  );
}
