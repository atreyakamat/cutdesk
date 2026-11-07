import { describe, expect, it } from "vitest";
import { generateGcode } from "./gcode";
import type { Doc } from "@/lib/doc/types";

/** A 10 × 10 mm cut rectangle at (5, 5) on a 100 × 100 mm mat. */
function rectDoc(): Doc {
  return {
    name: "Test",
    unit: "mm",
    mat: { preset: "custom", width: 100, height: 100 },
    layers: [{ id: "L1", name: "Cut", operation: "cut", color: "#000", visible: true, locked: false }],
    objects: [
      {
        id: "O1",
        name: "Rect",
        layerId: "L1",
        geo: { kind: "rect", width: 10, height: 10, cornerRadius: 0 },
        x: 5,
        y: 5,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
    ],
  };
}

describe("generateGcode", () => {
  it("emits a GRBL preamble in millimetres, absolute mode", () => {
    const { gcode } = generateGcode(rectDoc());
    expect(gcode).toContain("G21");
    expect(gcode).toContain("G90");
  });

  it("lowers and raises the tool for the one pass", () => {
    const { gcode, passCount } = generateGcode(rectDoc());
    expect(passCount).toBe(1);
    expect(gcode).toContain("Z-10"); // tool down (default)
    expect(gcode).toContain("Z0"); // tool up
  });

  it("flips Y by default so the mat's top-left maps to the machine", () => {
    const { gcode } = generateGcode(rectDoc());
    // Top-left corner (5,5) with matHeight 100 → Y = 95, reached by a rapid travel.
    expect(gcode).toContain("G0 X5 Y95");
  });

  it("does not flip Y when asked", () => {
    const { gcode } = generateGcode(rectDoc(), { flipY: false });
    expect(gcode).toContain("G0 X5 Y5");
  });

  it("closes the rectangle back to its first point", () => {
    const { gcode } = generateGcode(rectDoc());
    const travels = gcode.split("\n").filter((l) => l.includes("Y95"));
    // First point is both the travel target and the final cut vertex (closed path).
    expect(travels.length).toBeGreaterThanOrEqual(2);
  });

  it("reports a cut distance equal to the rectangle's perimeter", () => {
    const { cutDistanceMm } = generateGcode(rectDoc());
    expect(cutDistanceMm).toBeCloseTo(40, 3);
  });

  it("skips print/reference layers entirely", () => {
    const doc = rectDoc();
    doc.layers[0].operation = "print";
    const { passCount, gcode } = generateGcode(doc);
    expect(passCount).toBe(0);
    expect(gcode).not.toContain("Z-10");
  });

  it("produces valid preamble for an empty document without crashing", () => {
    const doc = rectDoc();
    doc.objects = [];
    const { gcode, passCount } = generateGcode(doc);
    expect(passCount).toBe(0);
    expect(gcode).toContain("G21");
    expect(gcode).toContain("G90");
  });

  it("never emits a zero feed, even if asked for one", () => {
    const { gcode } = generateGcode(rectDoc(), { feed: 0, travelFeed: 0, zFeed: 0 });
    expect(gcode).not.toMatch(/F0\b/);
    expect(gcode).toMatch(/F\d*[1-9]/); // some positive feed present
  });

  it("orders operations draw → score → cut", () => {
    const doc = rectDoc();
    doc.layers = [
      { id: "C", name: "Cut", operation: "cut", color: "#000", visible: true, locked: false },
      { id: "D", name: "Draw", operation: "draw", color: "#000", visible: true, locked: false },
    ];
    doc.objects = [
      { id: "o1", name: "c", layerId: "C", geo: { kind: "rect", width: 10, height: 10, cornerRadius: 0 }, x: 5, y: 5, rotation: 0, scaleX: 1, scaleY: 1 },
      { id: "o2", name: "d", layerId: "D", geo: { kind: "rect", width: 10, height: 10, cornerRadius: 0 }, x: 30, y: 30, rotation: 0, scaleX: 1, scaleY: 1 },
    ];
    const { gcode } = generateGcode(doc);
    expect(gcode.indexOf("; draw")).toBeGreaterThan(-1);
    expect(gcode.indexOf("; draw")).toBeLessThan(gcode.indexOf("; cut"));
  });
});
