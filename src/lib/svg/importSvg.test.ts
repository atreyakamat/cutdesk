import { describe, expect, it } from "vitest";
import { parseSvg } from "./importSvg";

describe("parseSvg", () => {
  it("imports a single path and scales it to the target size", () => {
    const svg = `<svg viewBox="0 0 16 16"><path d="M2 2 H14 V14 H2 Z"/></svg>`;
    const r = parseSvg(svg, { sizeMm: 80 });
    expect(r.paths).toHaveLength(1);
    // 12x12 content in a 16-unit box → scaled so the longest side is 80mm.
    expect(Math.max(r.width, r.height)).toBeCloseTo(80, 0);
  });

  it("converts basic shapes (rect, circle, ellipse, polygon, line) to paths", () => {
    const svg = `<svg viewBox="0 0 100 100">
      <rect x="0" y="0" width="20" height="10"/>
      <circle cx="50" cy="50" r="10"/>
      <ellipse cx="80" cy="20" rx="10" ry="5"/>
      <polygon points="0,90 10,90 5,80"/>
      <line x1="60" y1="60" x2="90" y2="90"/>
    </svg>`;
    const r = parseSvg(svg);
    expect(r.paths.length).toBe(5);
    for (const p of r.paths) expect(p.d.startsWith("M")).toBe(true);
  });

  it("applies an element transform (relative placement)", () => {
    const r = parseSvg(
      `<svg viewBox="0 0 100 100">
        <rect x="0" y="0" width="10" height="10"/>
        <rect x="0" y="0" width="10" height="10" transform="translate(80 0)"/>
      </svg>`,
      { sizeMm: 90 },
    );
    expect(r.paths).toHaveLength(2);
    const xs = r.paths.map((p) => p.x).sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBeGreaterThan(50); // the translated rect lands far to the right
  });

  it("returns nothing for junk / empty input, without throwing", () => {
    expect(() => parseSvg("not an svg")).not.toThrow();
    expect(parseSvg("not an svg").paths).toEqual([]);
    expect(parseSvg(`<svg viewBox="0 0 10 10"></svg>`).paths).toEqual([]);
  });

  // --- Adversarial hardening: SVGs are untrusted ---------------------------

  it("R1: never emits non-finite geometry from hostile input", () => {
    const r = parseSvg(`<svg viewBox="0 0 100 100">
      <path d="M0 0 L10 0 L10 10 Z" transform="scale(1e400)"/>
      <rect x="0" y="0" width="1e400" height="10"/>
      <rect x="0" y="0" width="10" height="10"/>
    </svg>`);
    expect(r.paths.length).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(r.width) && Number.isFinite(r.height)).toBe(true);
    for (const p of r.paths) {
      expect(p.d).not.toMatch(/NaN|Infinity/);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });

  it("R2: caps a pathological element count (no hang)", () => {
    const svg = `<svg viewBox="0 0 10 10">` + `<rect x="0" y="0" width="1" height="1"/>`.repeat(6000) + `</svg>`;
    const r = parseSvg(svg);
    expect(r.paths.length).toBeLessThanOrEqual(5000);
  });

  it("R2b: a malformed path d doesn't crash the whole import", () => {
    expect(() => parseSvg(`<svg viewBox="0 0 9 9"><path d="M NaN garbage 0"/></svg>`)).not.toThrow();
    // A bad element is skipped; valid ones alongside it still import.
    const r = parseSvg(`<svg viewBox="0 0 100 100"><path d="M bad data"/><rect x="0" y="0" width="10" height="10"/></svg>`);
    expect(r.paths).toHaveLength(1);
  });

  it("R3: a malformed transform doesn't throw; the element still imports", () => {
    expect(() => parseSvg(`<svg viewBox="0 0 10 10"><rect x="0" y="0" width="5" height="5" transform="matrix(1,2,3)"/></svg>`)).not.toThrow();
    const r = parseSvg(`<svg viewBox="0 0 10 10"><rect x="0" y="0" width="5" height="5" transform="translate(abc)"/></svg>`);
    expect(r.paths).toHaveLength(1);
  });
});
