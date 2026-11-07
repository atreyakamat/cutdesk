import { describe, expect, it } from "vitest";
import { clampMenuPosition, contextMenuItems } from "./contextMenu";

const ids = (opts: Parameters<typeof contextMenuItems>[0]) => contextMenuItems(opts).map((i) => i.id);
const byId = (opts: Parameters<typeof contextMenuItems>[0], id: string) =>
  contextMenuItems(opts).find((i) => i.id === id);

describe("contextMenuItems", () => {
  it("offers paste + select-all on empty canvas; paste is disabled with an empty clipboard", () => {
    expect(ids({ hasSelection: false, multi: false, canPaste: false, grouped: false })).toEqual(["paste", "selectAll"]);
    expect(byId({ hasSelection: false, multi: false, canPaste: false, grouped: false }, "paste")!.disabled).toBe(true);
    expect(byId({ hasSelection: false, multi: false, canPaste: true, grouped: false }, "paste")!.disabled).toBe(false);
  });

  it("offers the full edit set when something is selected", () => {
    const list = ids({ hasSelection: true, multi: false, canPaste: true, grouped: false });
    expect(list).toEqual(["copy", "cut", "paste", "duplicate", "group", "ungroup", "front", "back", "delete"]);
  });

  it("enables Group only for a multi-selection and Ungroup only when grouped", () => {
    const single = { hasSelection: true, multi: false, canPaste: false, grouped: false };
    expect(byId(single, "group")!.disabled).toBe(true);
    expect(byId(single, "ungroup")!.disabled).toBe(true);
    const multi = { hasSelection: true, multi: true, canPaste: false, grouped: true };
    expect(byId(multi, "group")!.disabled).toBe(false);
    expect(byId(multi, "ungroup")!.disabled).toBe(false);
  });

  it("marks Delete as dangerous", () => {
    expect(byId({ hasSelection: true, multi: false, canPaste: false, grouped: false }, "delete")!.danger).toBe(true);
  });
});

describe("clampMenuPosition (adversarial)", () => {
  it("R1: keeps an edge/overflowing click fully on screen", () => {
    expect(clampMenuPosition(1270, 790, 220, 300, 1280, 800)).toEqual({ x: 1060, y: 500 });
    expect(clampMenuPosition(-50, -50, 220, 300, 1280, 800)).toEqual({ x: 0, y: 0 });
  });

  it("R2: coerces NaN/Infinity to a finite position (non-finite → 0)", () => {
    expect(clampMenuPosition(Number.NaN, Infinity, 220, 300, 1280, 800)).toEqual({ x: 0, y: 0 });
    // A finite value still clamps normally alongside a coerced one.
    expect(clampMenuPosition(Number.NaN, 790, 220, 300, 1280, 800)).toEqual({ x: 0, y: 500 });
  });

  it("R3: a menu bigger than the viewport clamps to 0, never negative", () => {
    expect(clampMenuPosition(100, 100, 2000, 2000, 1280, 800)).toEqual({ x: 0, y: 0 });
  });
});
