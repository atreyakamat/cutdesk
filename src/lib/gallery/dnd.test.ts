import { describe, expect, it } from "vitest";
import { buildDropObject, parseDragPayload, serializeDragPayload, type DragPayload } from "./dnd";

describe("drag payload parsing", () => {
  it("round-trips a path payload", () => {
    const p: DragPayload = { t: "path", d: "M0 0L10 10", w: 10, h: 10, name: "Line" };
    expect(parseDragPayload(serializeDragPayload(p))).toEqual(p);
  });

  it("rejects junk, wrong shapes, non-finite sizes, and empty path data", () => {
    expect(parseDragPayload("not json")).toBeNull();
    expect(parseDragPayload(JSON.stringify({ t: "path", d: "M0 0", w: 1 }))).toBeNull(); // missing h/name
    expect(parseDragPayload(JSON.stringify({ t: "path", d: "", w: 1, h: 1, name: "x" }))).toBeNull();
    expect(parseDragPayload(JSON.stringify({ t: "path", d: "M0 0", w: Infinity, h: 1, name: "x" }))).toBeNull();
    expect(parseDragPayload(JSON.stringify({ t: "emoji", char: "", name: "x" }))).toBeNull();
    expect(parseDragPayload(JSON.stringify({ t: "other" }))).toBeNull();
  });

  it("accepts a valid emoji payload", () => {
    expect(parseDragPayload(JSON.stringify({ t: "emoji", char: "🍕", name: "pizza" }))).toEqual({
      t: "emoji",
      char: "🍕",
      name: "pizza",
    });
  });
});

describe("buildDropObject", () => {
  it("centres a path object on the drop point", () => {
    const obj = buildDropObject({ t: "path", d: "M0 0L20 10", w: 20, h: 10, name: "L" }, { x: 100, y: 50 });
    expect(obj).not.toBeNull();
    expect(obj!.geo).toEqual({ kind: "path", d: "M0 0L20 10" });
    expect(obj!.init).toEqual({ x: 90, y: 45 }); // top-left so the bbox centres on (100,50)
  });

  it("returns null for an emoji when no canvas is available (node env)", () => {
    // emojiToDataUrl needs a canvas; in the node test env it yields nothing.
    expect(buildDropObject({ t: "emoji", char: "🍕", name: "pizza" }, { x: 0, y: 0 })).toBeNull();
  });
});
