import { describe, expect, it } from "vitest";
import { MAX_TICKS, niceStep, rulerTicks } from "./ruler";

describe("niceStep", () => {
  it("rounds up to a 1/2/5 × 10^k step", () => {
    expect(niceStep(1)).toBe(1);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(6)).toBe(10);
    expect(niceStep(28)).toBe(50);
    expect(niceStep(0.3)).toBe(0.5);
  });

  it("is safe for non-positive / non-finite input", () => {
    expect(niceStep(0)).toBeGreaterThan(0);
    expect(niceStep(Number.NaN)).toBeGreaterThan(0);
    expect(niceStep(-5)).toBeGreaterThan(0);
  });
});

describe("rulerTicks", () => {
  it("produces evenly spaced, readable major ticks at a normal zoom", () => {
    const t = rulerTicks({ scale: 2, origin: 0, length: 400, unit: "mm" });
    expect(t.major.length).toBeGreaterThan(1);
    // Labels are numeric and strictly increasing.
    const vals = t.major.map((m) => Number(m.label));
    expect(vals.every((v) => Number.isFinite(v))).toBe(true);
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1]);
    // Consecutive majors are at least ~50px apart (readable) and evenly spaced.
    const gaps = t.major.slice(1).map((m, i) => m.pos - t.major[i].pos);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(50);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1e-6);
  });

  it("keeps every tick within the ruler length", () => {
    const t = rulerTicks({ scale: 3, origin: 40, length: 600, unit: "mm" });
    for (const m of t.major) {
      expect(m.pos).toBeGreaterThanOrEqual(0);
      expect(m.pos).toBeLessThanOrEqual(600);
    }
    for (const p of t.minor) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(600);
    }
  });

  it("emits finer minor ticks than major ticks", () => {
    const t = rulerTicks({ scale: 2, origin: 0, length: 400, unit: "mm" });
    expect(t.minor.length).toBeGreaterThan(t.major.length);
  });

  // --- Adversarial hardening -------------------------------------------------

  it("R1: non-finite or zero scale yields no ticks and never throws", () => {
    expect(() => rulerTicks({ scale: 0, origin: 0, length: 400, unit: "mm" })).not.toThrow();
    expect(rulerTicks({ scale: Number.NaN, origin: 0, length: 400, unit: "mm" }).major).toEqual([]);
    expect(rulerTicks({ scale: Infinity, origin: 0, length: 400, unit: "mm" }).major).toEqual([]);
  });

  it("R2: extreme zoom over a huge ruler can't generate unbounded ticks (DoS)", () => {
    const t = rulerTicks({ scale: 60, origin: -50000, length: 100000, unit: "mm" });
    expect(t.major.length).toBeLessThanOrEqual(MAX_TICKS);
    expect(t.minor.length).toBeLessThanOrEqual(MAX_TICKS);
  });

  it("R3: zero / negative length is handled safely", () => {
    expect(rulerTicks({ scale: 2, origin: 0, length: 0, unit: "mm" }).major).toEqual([]);
    expect(() => rulerTicks({ scale: 2, origin: 0, length: -10, unit: "mm" })).not.toThrow();
  });
});
