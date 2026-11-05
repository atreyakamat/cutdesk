import { describe, expect, it } from "vitest";
import { serializePath } from "./pathData";
import { canFinishPen, dropDuplicateTail, penSegs, type PenNode } from "./pen";

const corner = (x: number, y: number): PenNode => ({ x, y, ox: 0, oy: 0 });

describe("penSegs", () => {
  it("joins corner nodes with straight lines", () => {
    expect(serializePath(penSegs([corner(0, 0), corner(10, 0), corner(10, 10)], false))).toBe("M0 0L10 0L10 10");
  });

  it("closes a polygon with Z and no extra line when it already returns to the start", () => {
    expect(serializePath(penSegs([corner(0, 0), corner(10, 0), corner(10, 10)], true))).toBe("M0 0L10 0L10 10L0 0Z");
    expect(serializePath(penSegs([corner(0, 0), corner(10, 0), corner(10, 10), corner(0, 0)], true))).toBe(
      "M0 0L10 0L10 10L0 0Z",
    );
  });

  it("uses mirrored handles for smooth nodes", () => {
    const a: PenNode = { x: 0, y: 0, ox: 5, oy: 0 };
    const b: PenNode = { x: 20, y: 0, ox: 5, oy: 5 };
    const [, c] = penSegs([a, b], false);
    expect(c).toEqual({ t: "C", x1: 5, y1: 0, x2: 15, y2: -5, x: 20, y: 0 });
  });

  it("curves into a corner using only the smooth node's handle", () => {
    const [, c] = penSegs([{ x: 0, y: 0, ox: 4, oy: 4 }, corner(10, 0)], false);
    expect(c).toEqual({ t: "C", x1: 4, y1: 4, x2: 10, y2: 0, x: 10, y: 0 });
  });

  it("does not close paths with fewer than three nodes", () => {
    expect(serializePath(penSegs([corner(0, 0), corner(5, 5)], true))).toBe("M0 0L5 5");
    expect(penSegs([], false)).toEqual([]);
  });
});

describe("pen helpers", () => {
  it("knows when a path can be finished", () => {
    expect(canFinishPen([corner(0, 0)], false)).toBe(false);
    expect(canFinishPen([corner(0, 0), corner(1, 1)], false)).toBe(true);
    expect(canFinishPen([corner(0, 0), corner(1, 1)], true)).toBe(false);
    expect(canFinishPen([corner(0, 0), corner(1, 1), corner(2, 0)], true)).toBe(true);
  });

  it("drops a duplicate node left by a double-click", () => {
    expect(dropDuplicateTail([corner(0, 0), corner(10, 10), corner(10.1, 10)])).toHaveLength(2);
    expect(dropDuplicateTail([corner(0, 0), corner(10, 10), corner(20, 10)])).toHaveLength(3);
    expect(dropDuplicateTail([corner(0, 0)])).toHaveLength(1);
  });
});
