import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultDoc } from "@/lib/doc/defaults";
import { worldAABB } from "@/lib/doc/geometry";
import { useEditor } from "./editorStore";

const rect = (w = 20, h = 10) => ({ kind: "rect" as const, width: w, height: h, cornerRadius: 0 });
const image = { kind: "image" as const, src: "data:image/png;base64,AAAA", width: 10, height: 10 };

function state() {
  return useEditor.getState();
}

beforeEach(() => {
  vi.useRealTimers();
  state().loadDoc(createDefaultDoc());
});

describe("adding objects", () => {
  it("puts shapes on the active cut layer and selects them", () => {
    const id = state().addObject({ geo: rect(), init: { x: 5, y: 5 } });
    const obj = state().doc.objects.find((o) => o.id === id)!;
    const layer = state().doc.layers.find((l) => l.id === obj.layerId)!;
    expect(layer.operation).toBe("cut");
    expect(state().selection).toEqual([id]);
    expect(obj.name).toBe("Rectangle 1");
  });

  it("names shapes by kind and count", () => {
    state().addObject({ geo: rect() });
    state().addObject({ geo: rect() });
    state().addObject({ geo: { kind: "ellipse", rx: 5, ry: 5 } });
    expect(state().doc.objects.map((o) => o.name)).toEqual(["Rectangle 1", "Rectangle 2", "Ellipse 1"]);
  });

  it("creates a reference layer under everything for images, in the same undo step", () => {
    const before = state().doc.layers.length;
    const [shape, art] = state().addObjects([{ geo: rect() }, { geo: image }]);
    const { doc } = state();
    expect(doc.layers).toHaveLength(before + 1);
    expect(doc.layers[0].operation).toBe("print");
    expect(doc.objects.find((o) => o.id === art)!.layerId).toBe(doc.layers[0].id);
    // Selection prefers the cuttable shape over the reference image.
    expect(state().selection).toEqual([shape]);
    state().undo();
    expect(state().doc.layers).toHaveLength(before);
    expect(state().doc.objects).toHaveLength(0);
  });

  it("never drops a new shape onto a reference layer, even if that layer is active", () => {
    state().addObject({ geo: image });
    const printLayer = state().doc.layers.find((l) => l.operation === "print")!;
    state().setActiveLayer(printLayer.id);

    const id = state().addObject({ geo: rect() });
    const obj = state().doc.objects.find((o) => o.id === id)!;
    const layer = state().doc.layers.find((l) => l.id === obj.layerId)!;
    expect(layer.operation).toBe("cut");
    expect(state().activeLayerId).toBe(layer.id);
  });
});

describe("history", () => {
  it("undoes and redoes", () => {
    const id = state().addObject({ geo: rect() });
    state().removeObjects([id]);
    expect(state().doc.objects).toHaveLength(0);
    state().undo();
    expect(state().doc.objects).toHaveLength(1);
    state().redo();
    expect(state().doc.objects).toHaveLength(0);
  });

  it("clears the redo stack on a new edit", () => {
    state().addObject({ geo: rect() });
    state().undo();
    expect(state().future).toHaveLength(1);
    state().addObject({ geo: rect() });
    expect(state().future).toHaveLength(0);
  });

  it("merges rapid edits that share a key into one step", () => {
    const id = state().addObject({ geo: rect(), init: { x: 0, y: 0 } });
    const steps = state().past.length;
    state().nudge(1, 0);
    state().nudge(1, 0);
    state().nudge(1, 0);
    expect(state().past.length).toBe(steps + 1);
    expect(state().doc.objects.find((o) => o.id === id)!.x).toBe(3);
    state().undo();
    expect(state().doc.objects.find((o) => o.id === id)!.x).toBe(0);
  });

  it("does not merge edits that are far apart in time", () => {
    vi.useFakeTimers();
    state().addObject({ geo: rect(), init: { x: 0, y: 0 } });
    const steps = state().past.length;
    state().nudge(1, 0);
    vi.advanceTimersByTime(2000);
    state().nudge(1, 0);
    expect(state().past.length).toBe(steps + 2);
  });

  it("caps history at 100 steps", () => {
    const id = state().addObject({ geo: rect() });
    for (let i = 0; i < 130; i++) state().duplicateObjects([id]);
    expect(state().past).toHaveLength(100);
    // The oldest steps fall off; the most recent edit is still undoable.
    state().undo();
    expect(state().doc.objects).toHaveLength(130);
  });

  it("drops selected ids that no longer exist after undo", () => {
    const id = state().addObject({ geo: rect() });
    expect(state().selection).toEqual([id]);
    state().undo();
    expect(state().selection).toEqual([]);
  });
});

describe("transforms and arrangement", () => {
  it("sets position by bounds and size by bounds", () => {
    const id = state().addObject({ geo: { kind: "ellipse", rx: 10, ry: 10 }, init: { x: 50, y: 50 } });
    state().setPosition(0, 0);
    let box = worldAABB(state().doc.objects.find((o) => o.id === id)!);
    expect(box.minX).toBeCloseTo(0, 3);
    expect(box.minY).toBeCloseTo(0, 3);
    state().setSize({ width: 60 }, true);
    box = worldAABB(state().doc.objects.find((o) => o.id === id)!);
    expect(box.maxX - box.minX).toBeCloseTo(60, 3);
    expect(box.maxY - box.minY).toBeCloseTo(60, 3);
  });

  it("aligns a single object to the mat and several to each other", () => {
    const a = state().addObject({ geo: rect(20, 10), init: { x: 10, y: 10 } });
    state().align("right");
    expect(worldAABB(state().doc.objects.find((o) => o.id === a)!).maxX).toBeCloseTo(state().doc.mat.width, 6);

    state().loadDoc(createDefaultDoc());
    const [p, q] = state().addObjects([
      { geo: rect(20, 10), init: { x: 10, y: 10 } },
      { geo: rect(40, 10), init: { x: 100, y: 50 } },
    ]);
    state().select([p, q]);
    state().align("left");
    const lefts = state().doc.objects.map((o) => worldAABB(o).minX);
    expect(lefts[0]).toBeCloseTo(10, 6);
    expect(lefts[1]).toBeCloseTo(10, 6);
  });

  it("reorders within a layer", () => {
    const [a, b, c] = state().addObjects([{ geo: rect() }, { geo: rect() }, { geo: rect() }]);
    state().select([a]);
    state().restack("front");
    expect(state().doc.objects.map((o) => o.id)).toEqual([b, c, a]);
    state().restack("back");
    expect(state().doc.objects.map((o) => o.id)).toEqual([a, b, c]);
    state().restack("forward");
    expect(state().doc.objects.map((o) => o.id)).toEqual([b, a, c]);
    state().restack("backward");
    expect(state().doc.objects.map((o) => o.id)).toEqual([a, b, c]);
  });

  it("duplicates with an offset and selects the copy", () => {
    const id = state().addObject({ geo: rect(), init: { x: 10, y: 10 } });
    state().duplicateObjects([id]);
    const copy = state().doc.objects[1];
    expect(copy.id).not.toBe(id);
    expect(copy.x).toBe(15);
    expect(state().selection).toEqual([copy.id]);
  });
});

describe("layers", () => {
  it("refuses to put shapes on a reference layer", () => {
    const shape = state().addObject({ geo: rect() });
    state().addObject({ geo: image });
    const printLayer = state().doc.layers.find((l) => l.operation === "print")!;
    state().moveToLayer([shape], printLayer.id);
    expect(state().notice?.kind).toBe("error");
    expect(state().doc.objects.find((o) => o.id === shape)!.layerId).not.toBe(printLayer.id);
  });

  it("refuses to turn a layer with shapes into a reference layer", () => {
    state().addObject({ geo: rect() });
    const cutLayer = state().doc.layers.find((l) => l.operation === "cut")!;
    expect(state().updateLayer(cutLayer.id, { operation: "print" })).toBe(false);
    expect(state().doc.layers.find((l) => l.id === cutLayer.id)!.operation).toBe("cut");
  });

  it("numbers new layers of an existing kind", () => {
    const id = state().addLayer("cut");
    expect(state().doc.layers.find((l) => l.id === id)!.name).toBe("Cut 2");
    expect(state().activeLayerId).toBe(id);
  });

  it("removes a layer's objects with it and keeps at least one layer", () => {
    const shape = state().addObject({ geo: rect() });
    const layerId = state().doc.objects.find((o) => o.id === shape)!.layerId;
    state().removeLayer(layerId);
    expect(state().doc.objects).toHaveLength(0);
    state().undo();
    expect(state().doc.objects).toHaveLength(1);

    const remaining = createDefaultDoc();
    state().loadDoc({ ...remaining, layers: [remaining.layers[0]] });
    state().removeLayer(remaining.layers[0].id);
    expect(state().doc.layers).toHaveLength(1);
  });

  it("reorders layers from a top-first list", () => {
    const [bottom, top] = state().doc.layers.map((l) => l.id);
    state().reorderLayers([bottom, top]);
    expect(state().doc.layers.map((l) => l.id)).toEqual([top, bottom]);
  });
});

describe("mat and view", () => {
  it("switches presets and clamps custom sizes", () => {
    state().setMat({ preset: "a4" });
    expect(state().doc.mat).toEqual({ preset: "a4", width: 210, height: 297 });
    state().setMat({ width: 5 });
    expect(state().doc.mat.preset).toBe("custom");
    expect(state().doc.mat.width).toBe(20);
  });

  it("fits the mat into the viewport and zooms about a point", () => {
    state().setViewport(1000, 800);
    const { scale } = state().view;
    expect(scale).toBeGreaterThan(1);
    const anchor = { x: 400, y: 300 };
    const mmBefore = { x: (anchor.x - state().view.tx) / scale, y: (anchor.y - state().view.ty) / scale };
    state().zoomAt(2, anchor.x, anchor.y);
    const v = state().view;
    expect(v.scale).toBeCloseTo(scale * 2, 6);
    expect((anchor.x - v.tx) / v.scale).toBeCloseTo(mmBefore.x, 6);
    expect((anchor.y - v.ty) / v.scale).toBeCloseTo(mmBefore.y, 6);
  });

  it("won't start a preview with nothing to cut", () => {
    state().startPreview();
    expect(state().preview).toBeNull();
    expect(state().notice?.kind).toBe("info");
    state().addObject({ geo: rect() });
    state().startPreview();
    expect(state().preview).not.toBeNull();
  });
});
