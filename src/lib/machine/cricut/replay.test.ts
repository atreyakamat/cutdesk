import { describe, expect, it } from "vitest";
import type { CaptureFrame } from "./capture";
import { buildReplayPlan, UnsafeReplayError } from "./replay";

const f = (dir: "tx" | "rx", ...bytes: number[]): CaptureFrame => ({ dir, bytes: Uint8Array.from(bytes) });

describe("buildReplayPlan", () => {
  it("keeps only host→device frames, in order, and totals them", () => {
    const plan = buildReplayPlan([f("tx", 1, 2, 3), f("rx", 9), f("tx", 4, 5)]);
    expect(plan.frames.map((b) => Array.from(b))).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
    expect(plan.totalBytes).toBe(5);
    expect(plan.maxFrameBytes).toBe(3);
  });

  it("refuses a capture with no tx frames", () => {
    expect(() => buildReplayPlan([f("rx", 1, 2)])).toThrow(UnsafeReplayError);
  });

  it("refuses an over-sized frame", () => {
    const big = f("tx", ...new Array(20).fill(0));
    expect(() => buildReplayPlan([big], { maxFrameBytes: 8 })).toThrow(/over the 8-byte/);
  });

  it("refuses an over-sized total", () => {
    const frames = [f("tx", 1, 2, 3, 4), f("tx", 5, 6, 7, 8)];
    expect(() => buildReplayPlan(frames, { maxTotalBytes: 5 })).toThrow(/over the 5-byte/);
  });
});
