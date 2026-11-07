/**
 * Turn a CutDesk document into GRBL-style G-code.
 *
 * Input geometry comes from buildCutPlan(), which already flattens every object
 * to world-space polylines in millimetres and orders them the way a machine
 * runs: draw, then score, then cut. Each pass becomes: travel to the start with
 * the tool up, lower the tool, trace the polyline, raise the tool.
 *
 * Coordinates: the document has its origin at the top-left with Y pointing down
 * (SVG/Konva convention). Most cutters home to a corner with Y up, so `flipY`
 * maps Y to (matHeight - y) by default. `originX/originY`, `zUp/zDown` and the
 * feed rates are all adjustable because real machines need calibration.
 */

import { buildCutPlan } from "@/lib/doc/cutPlan";
import type { Doc, Operation } from "@/lib/doc/types";

type CutOp = Exclude<Operation, "print">;

export interface GcodeOptions {
  /** Cutting/drawing feed rate, mm/min. */
  feed: number;
  /** Travel feed rate, mm/min (used only when useRapid is false). */
  travelFeed: number;
  /** Use G0 rapid moves between passes instead of a fed G1. */
  useRapid: boolean;
  /** Tool-up and tool-down Z heights, and the Z feed rate. */
  zUp: number;
  zDown: number;
  zFeed: number;
  /** Map document Y (down) to machine Y (up): y → matHeight - y. */
  flipY: boolean;
  /** Added to every coordinate after the optional flip. */
  originX: number;
  originY: number;
  /** Emit a homing cycle ($H) at the start. */
  home: boolean;
  /** Emit a tool-select code (e.g. T0/T1) per operation. */
  toolSelect: boolean;
  toolByOperation: Record<CutOp, string>;
  /** Decimal places for coordinates. */
  decimals: number;
}

export const DEFAULT_GCODE_OPTIONS: GcodeOptions = {
  feed: 1000,
  travelFeed: 2000,
  useRapid: true,
  zUp: 0,
  zDown: -10,
  zFeed: 300,
  flipY: true,
  originX: 0,
  originY: 0,
  home: false,
  toolSelect: false,
  toolByOperation: { cut: "T0", score: "T0", draw: "T0" },
  decimals: 3,
};

export interface GcodeResult {
  gcode: string;
  lineCount: number;
  passCount: number;
  /** Total length of the cut/score/draw paths, mm (travel excluded). */
  cutDistanceMm: number;
  /** Rough run-time estimate in seconds from the cut length and feed. */
  estimateSeconds: number;
}

export function generateGcode(doc: Doc, options: Partial<GcodeOptions> = {}): GcodeResult {
  const o: GcodeOptions = { ...DEFAULT_GCODE_OPTIONS, ...options };
  // A blank or zero feed would emit "F0" and stall a real machine, so fall back
  // to the defaults for any non-positive feed rate.
  o.feed = o.feed > 0 ? o.feed : DEFAULT_GCODE_OPTIONS.feed;
  o.travelFeed = o.travelFeed > 0 ? o.travelFeed : DEFAULT_GCODE_OPTIONS.travelFeed;
  o.zFeed = o.zFeed > 0 ? o.zFeed : DEFAULT_GCODE_OPTIONS.zFeed;
  const plan = buildCutPlan(doc);
  const matHeight = doc.mat.height;

  const n = (v: number): string => {
    const r = Number(v.toFixed(o.decimals));
    return String(Object.is(r, -0) ? 0 : r);
  };
  const mapX = (x: number): string => n(x + o.originX);
  const mapY = (y: number): string => n((o.flipY ? matHeight - y : y) + o.originY);

  const out: string[] = [];
  out.push(`; CutDesk G-code — ${doc.name}`);
  out.push(`; generated ${new Date().toISOString()}`);
  out.push(`; mat ${n(doc.mat.width)} x ${n(doc.mat.height)} mm · ${plan.passes.length} passes`);
  out.push("G21"); // millimetres
  out.push("G90"); // absolute positioning
  if (o.home) out.push("$H");
  out.push(`G1 Z${n(o.zUp)} F${n(o.zFeed)}`); // start with the tool up

  let currentTool = "";
  let lastOp: CutOp | null = null;

  for (const pass of plan.passes) {
    const pts = pass.points;
    if (pts.length < 2) continue;

    if (o.toolSelect) {
      const tool = o.toolByOperation[pass.operation];
      if (tool && tool !== currentTool) {
        out.push(tool);
        currentTool = tool;
      }
    }
    if (pass.operation !== lastOp) {
      out.push(`; ${pass.operation}`);
      lastOp = pass.operation;
    }

    // Travel to the start with the tool raised.
    out.push(o.useRapid ? `G0 X${mapX(pts[0].x)} Y${mapY(pts[0].y)}` : `G1 X${mapX(pts[0].x)} Y${mapY(pts[0].y)} F${n(o.travelFeed)}`);
    out.push(`G1 Z${n(o.zDown)} F${n(o.zFeed)}`); // tool down
    // First fed move carries the feed rate; GRBL keeps it modal after that.
    out.push(`G1 X${mapX(pts[1].x)} Y${mapY(pts[1].y)} F${n(o.feed)}`);
    for (let i = 2; i < pts.length; i++) {
      out.push(`G1 X${mapX(pts[i].x)} Y${mapY(pts[i].y)}`);
    }
    out.push(`G1 Z${n(o.zUp)} F${n(o.zFeed)}`); // tool up
  }

  out.push(`G1 Z${n(o.zUp)} F${n(o.zFeed)}`);
  out.push(`G0 X${mapX(0)} Y${mapY(0)}`); // return toward the origin
  out.push("; done");

  const gcode = out.join("\n") + "\n";
  const estimateSeconds = o.feed > 0 ? Math.round((plan.totalLength / o.feed) * 60) : 0;
  return { gcode, lineCount: out.length, passCount: plan.passes.length, cutDistanceMm: plan.totalLength, estimateSeconds };
}
