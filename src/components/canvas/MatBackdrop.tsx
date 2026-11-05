"use client";

import { useEffect, useRef } from "react";
import { MAT_GUTTER } from "@/lib/doc/mats";
import type { Mat, Unit } from "@/lib/doc/types";
import { MM_PER_IN } from "@/lib/doc/units";
import { useEditor, type View } from "@/store/editorStore";

const MAT_GREEN = "#a7cdb1";
const NUMERAL = "#1f4431";

interface GridSpec {
  /** Millimetres between labelled lines. */
  step: number;
  /** Millimetres between faint subdivisions. */
  sub: number;
  /** Value printed for each step (centimetres or inches). */
  divisor: number;
  caption: string;
}

function gridFor(unit: Unit): GridSpec {
  return unit === "in"
    ? { step: MM_PER_IN, sub: MM_PER_IN / 4, divisor: MM_PER_IN, caption: "in" }
    : { step: 10, sub: 2, divisor: 10, caption: "cm" };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawMat(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number; dpr: number },
  view: View,
  mat: Mat,
  unit: Unit,
): void {
  const { width, height, dpr } = size;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const s = view.scale;
  const ox = view.tx;
  const oy = view.ty;
  const gl = MAT_GUTTER.left * s;
  const gt = MAT_GUTTER.top * s;
  const gr = MAT_GUTTER.right * s;
  const gb = MAT_GUTTER.bottom * s;
  const gridW = mat.width * s;
  const gridH = mat.height * s;

  // Mat body, lifted off the bench with a soft shadow.
  ctx.save();
  ctx.shadowColor = "rgba(23, 37, 30, 0.22)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = MAT_GREEN;
  roundedRect(ctx, ox - gl, oy - gt, gridW + gl + gr, gridH + gt + gb, Math.max(4, 3 * s));
  ctx.fill();
  ctx.restore();

  // Keep grid lines inside the grid area.
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, gridW, gridH);
  ctx.clip();

  const spec = gridFor(unit);
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  };
  const crisp = (v: number) => Math.round(v) + 0.5;

  // Faint subdivisions appear once they're far enough apart to be useful.
  if (spec.sub * s >= 8) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    for (let mm = 0; mm <= mat.width + 1e-6; mm += spec.sub) line(crisp(ox + mm * s), oy, crisp(ox + mm * s), oy + gridH);
    for (let mm = 0; mm <= mat.height + 1e-6; mm += spec.sub) line(ox, crisp(oy + mm * s), ox + gridW, crisp(oy + mm * s));
    ctx.stroke();
  }

  // Main grid lines. Every fifth is stronger on the metric mat.
  const strong = unit === "mm" ? 5 : 0;
  const drawLines = (strongPass: boolean) => {
    ctx.beginPath();
    ctx.strokeStyle = strongPass ? "rgba(255, 255, 255, 0.85)" : "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 1;
    for (let i = 0, mm = 0; mm <= mat.width + 1e-6; i++, mm = i * spec.step) {
      const isStrong = strong > 0 && i % strong === 0;
      if (isStrong === strongPass) line(crisp(ox + mm * s), oy, crisp(ox + mm * s), oy + gridH);
    }
    for (let i = 0, mm = 0; mm <= mat.height + 1e-6; i++, mm = i * spec.step) {
      const isStrong = strong > 0 && i % strong === 0;
      if (isStrong === strongPass) line(ox, crisp(oy + mm * s), ox + gridW, crisp(oy + mm * s));
    }
    ctx.stroke();
  };
  if (spec.step * s >= 5) {
    drawLines(false);
    if (strong) drawLines(true);
  }
  ctx.restore();

  // Edge of the cuttable area.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ox, oy, gridW, gridH);

  // Ruler numerals sit in the gutter, like the printed numbers on a real mat.
  const fontPx = Math.min(12, MAT_GUTTER.top * s * 0.62);
  if (fontPx >= 7.5) {
    ctx.fillStyle = NUMERAL;
    ctx.font = `600 ${fontPx}px "Hanken Grotesk Variable", system-ui, sans-serif`;
    const every = Math.max(1, Math.ceil(30 / (spec.step * s)));

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = every; i * spec.step <= mat.width + 1e-6; i += every) {
      ctx.fillText(String(i), ox + i * spec.step * s, oy - gt / 2);
    }
    ctx.textAlign = "right";
    for (let i = every; i * spec.step <= mat.height + 1e-6; i += every) {
      ctx.fillText(String(i), ox - gl * 0.22, oy + i * spec.step * s);
    }
    ctx.globalAlpha = 0.65;
    ctx.textAlign = "center";
    ctx.fillText(spec.caption, ox - gl / 2, oy - gt / 2);
    ctx.globalAlpha = 1;
  }
}

/** The mat itself: a canvas under the Konva stage that follows the shared view. */
export function MatBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  const view = useEditor((s) => s.view);
  const viewport = useEditor((s) => s.viewport);
  const mat = useEditor((s) => s.doc.mat);
  const unit = useEditor((s) => s.doc.unit);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || viewport.width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.round(viewport.width * dpr);
    const h = Math.round(viewport.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawMat(ctx, { width: viewport.width, height: viewport.height, dpr }, view, mat, unit);
  }, [view, viewport, mat, unit]);

  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 size-full" />;
}
