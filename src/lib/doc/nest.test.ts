import { describe, expect, it } from "vitest";
import { nestBoxes } from "./nest";

describe("nestBoxes", () => {
  it("places boxes that fit on one row left-to-right with a gap", () => {
    const pos = nestBoxes(
      [
        { id: "a", w: 10, h: 10 },
        { id: "b", w: 10, h: 10 },
        { id: "c", w: 10, h: 10 },
      ],
      { width: 100, gap: 2, margin: 0 },
    );
    expect(pos.get("a")).toEqual({ x: 0, y: 0 });
    expect(pos.get("b")).toEqual({ x: 12, y: 0 });
    expect(pos.get("c")).toEqual({ x: 24, y: 0 });
  });

  it("wraps to a new row when the mat width runs out", () => {
    const pos = nestBoxes(
      [
        { id: "a", w: 40, h: 10 },
        { id: "b", w: 40, h: 10 },
        { id: "c", w: 40, h: 10 },
      ],
      { width: 100, gap: 2, margin: 0 },
    );
    expect(pos.get("a")!.y).toBe(0);
    expect(pos.get("b")!.y).toBe(0);
    expect(pos.get("c")!.y).toBe(12); // wrapped below (rowH 10 + gap 2)
    expect(pos.get("c")!.x).toBe(0);
  });

  it("packs tallest first (shelf FFD), so rows are tight", () => {
    const pos = nestBoxes(
      [
        { id: "short", w: 10, h: 5 },
        { id: "tall", w: 10, h: 30 },
      ],
      { width: 100, gap: 2, margin: 0 },
    );
    // Tall is placed first → x 0; short after it → x 12. Same row.
    expect(pos.get("tall")!.x).toBe(0);
    expect(pos.get("short")!.x).toBe(12);
  });

  it("honors the margin and returns an empty map for no items", () => {
    expect(nestBoxes([{ id: "a", w: 10, h: 10 }], { width: 100, gap: 2, margin: 5 }).get("a")).toEqual({ x: 5, y: 5 });
    expect(nestBoxes([], { width: 100, gap: 2, margin: 0 }).size).toBe(0);
  });
});
