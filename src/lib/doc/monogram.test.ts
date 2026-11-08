import { describe, expect, it } from "vitest";
import { monogramFrame } from "./monogram";

describe("monogramFrame", () => {
  it("builds a circle frame enclosing the text with padding, centred on it", () => {
    const f = monogramFrame("circle", 20, 10, 5)!;
    expect(f.geo).toEqual({ kind: "ellipse", rx: 15, ry: 10 }); // (20+10)/2, (10+10)/2
    expect(f.dx).toBe(10); // text top-left → ellipse centre
    expect(f.dy).toBe(5);
  });

  it("builds a diamond frame as a path anchored at the frame's top-left", () => {
    const f = monogramFrame("diamond", 20, 10, 5)!;
    expect(f.geo.kind).toBe("path");
    expect((f.geo as { d: string }).d.startsWith("M")).toBe(true);
    expect(f.dx).toBe(-5);
    expect(f.dy).toBe(-5);
  });

  it("returns null for no frame or degenerate size", () => {
    expect(monogramFrame("none", 20, 10, 5)).toBeNull();
    expect(monogramFrame("circle", 0, 10, 5)).toBeNull();
  });
});
