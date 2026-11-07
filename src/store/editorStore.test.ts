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
  // The clipboard is intentionally durable across documents, so reset it for isolation.
  useEditor.setState({ clipboard: null });
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

describe("pages", () => {
  it("starts with a single page that mirrors the active doc", () => {
    expect(state().pages).toHaveLength(1);
    expect(state().activePage).toBe(0);
    expect(state().pages[0]).toBe(state().doc);
  });

  it("adds a blank page and switches to it, keeping pages[active] in sync with doc", () => {
    const id = state().addObject({ geo: rect(), init: { x: 5, y: 5 } });
    state().addPage();
    expect(state().pages).toHaveLength(2);
    expect(state().activePage).toBe(1);
    expect(state().doc.objects).toHaveLength(0); // new page is empty
    expect(state().pages[0].objects.some((o) => o.id === id)).toBe(true); // page 1 kept its shape
    expect(state().pages[1]).toBe(state().doc);
  });

  it("keeps each page's own objects and undo history when switching", () => {
    state().addObject({ geo: rect() }); // page 0 has 1 object
    state().addPage();
    state().addObject({ geo: rect() });
    state().addObject({ geo: rect() }); // page 1 has 2 objects
    state().selectPage(0);
    expect(state().doc.objects).toHaveLength(1);
    state().selectPage(1);
    expect(state().doc.objects).toHaveLength(2);
    state().undo(); // undo only affects page 1
    expect(state().doc.objects).toHaveLength(1);
    expect(state().pages[0].objects).toHaveLength(1);
  });

  it("duplicates a page with independent object ids", () => {
    const id = state().addObject({ geo: rect() });
    state().duplicatePage(0);
    expect(state().pages).toHaveLength(2);
    expect(state().activePage).toBe(1);
    expect(state().doc.objects).toHaveLength(1);
    expect(state().doc.objects[0].id).not.toBe(id); // copy got a fresh id
  });

  it("deletes a page and refuses to delete the last one", () => {
    state().addPage();
    state().addPage();
    expect(state().pages).toHaveLength(3);
    state().deletePage(1);
    expect(state().pages).toHaveLength(2);
    state().deletePage(0);
    expect(state().pages).toHaveLength(1);
    state().deletePage(0); // last page — ignored
    expect(state().pages).toHaveLength(1);
  });
});

describe("fill and opacity", () => {
  it("sets a per-object fill and opacity, and clears the fill back to the layer", () => {
    const id = state().addObject({ geo: rect() });
    state().setStyle([id], { fill: "#FF8FA3", opacity: 0.5 });
    let o = state().doc.objects.find((x) => x.id === id)!;
    expect(o.style).toEqual({ fill: "#FF8FA3", opacity: 0.5 });
    state().setStyle([id], { fill: undefined });
    o = state().doc.objects.find((x) => x.id === id)!;
    expect(o.style?.fill).toBeUndefined();
    expect(o.style?.opacity).toBe(0.5);
  });
});

describe("grouping", () => {
  it("groups the selection and selecting one member selects the whole group", () => {
    const [a, b, c] = state().addObjects([{ geo: rect() }, { geo: rect() }, { geo: rect() }]);
    state().select([a, b]);
    state().group();
    const gid = state().doc.objects.find((o) => o.id === a)!.groupId;
    expect(gid).toBeTruthy();
    expect(state().doc.objects.find((o) => o.id === b)!.groupId).toBe(gid);
    expect(state().doc.objects.find((o) => o.id === c)!.groupId).toBeUndefined();

    state().clearSelection();
    state().select([a]); // clicking one member
    expect(new Set(state().selection)).toEqual(new Set([a, b]));
  });

  it("won't group a single object", () => {
    const id = state().addObject({ geo: rect() });
    state().select([id]);
    state().group();
    expect(state().doc.objects.find((o) => o.id === id)!.groupId).toBeUndefined();
  });

  it("ungroups", () => {
    const [a, b] = state().addObjects([{ geo: rect() }, { geo: rect() }]);
    state().select([a, b]);
    state().group();
    state().ungroup();
    expect(state().doc.objects.every((o) => o.groupId === undefined)).toBe(true);
  });

  it("gives a duplicated group its own group id", () => {
    const [a, b] = state().addObjects([{ geo: rect() }, { geo: rect() }]);
    state().select([a, b]);
    state().group();
    const gid = state().doc.objects.find((o) => o.id === a)!.groupId;
    state().duplicateObjects([a, b]);
    const copies = state().selection.map((id) => state().doc.objects.find((o) => o.id === id)!);
    const copyGid = copies[0].groupId;
    expect(copyGid).toBeTruthy();
    expect(copyGid).not.toBe(gid);
    expect(copies.every((o) => o.groupId === copyGid)).toBe(true);
  });
});

describe("distribute", () => {
  // Three 10-wide rects; after horizontal distribute the gaps between them are equal.
  function three() {
    return state().addObjects([
      { geo: rect(10, 10), init: { x: 0, y: 0 } }, // x 0..10
      { geo: rect(10, 10), init: { x: 15, y: 0 } }, // x 15..25 (will move)
      { geo: rect(10, 10), init: { x: 100, y: 0 } }, // x 100..110
    ]);
  }

  it("does nothing with fewer than three objects", () => {
    const [a, b] = state().addObjects([{ geo: rect(10, 10), init: { x: 0, y: 0 } }, { geo: rect(10, 10), init: { x: 50, y: 0 } }]);
    state().select([a, b]);
    state().distribute("h");
    const xs = [a, b].map((id) => worldAABB(state().doc.objects.find((o) => o.id === id)!).minX);
    expect(xs).toEqual([0, 50]);
  });

  it("equalises horizontal gaps, anchoring the extremes", () => {
    const [a, b, c] = three();
    state().select([a, b, c]);
    state().distribute("h");
    const box = (id: string) => worldAABB(state().doc.objects.find((o) => o.id === id)!);
    // span 0..110, 3×10 wide → free 80, gap 40. Middle sits at 50..60.
    expect(box(a).minX).toBeCloseTo(0, 6);
    expect(box(c).maxX).toBeCloseTo(110, 6);
    expect(box(b).minX).toBeCloseTo(50, 6);
  });

  it("equalises vertical gaps", () => {
    const [a, b, c] = state().addObjects([
      { geo: rect(10, 10), init: { x: 0, y: 0 } },
      { geo: rect(10, 10), init: { x: 0, y: 15 } },
      { geo: rect(10, 10), init: { x: 0, y: 100 } },
    ]);
    state().select([a, b, c]);
    state().distribute("v");
    const box = (id: string) => worldAABB(state().doc.objects.find((o) => o.id === id)!);
    expect(box(b).minY).toBeCloseTo(50, 6);
  });

  // --- Adversarial hardening (treat inputs as hostile) ---------------------

  function docWithRects(positions: Array<{ x: number; y: number }>) {
    const base = createDefaultDoc();
    const layerId = base.layers[0].id;
    return {
      ...base,
      objects: positions.map((p, i) => ({
        id: `h${i}`,
        name: `h${i}`,
        layerId,
        geo: { kind: "rect" as const, width: 10, height: 10, cornerRadius: 0 },
        x: p.x,
        y: p.y,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      })),
    };
  }

  it("R1: refuses atomically (no-op) when any object has a non-finite coordinate", () => {
    state().loadDoc(docWithRects([{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: Infinity, y: 0 }]));
    const before = state().doc.objects.map((o) => o.x);
    state().select(["h0", "h1", "h2"]);
    state().distribute("h");
    // Nothing moves: the finite objects aren't scattered and no new NaN is written.
    expect(state().doc.objects.map((o) => o.x)).toEqual(before);
    expect(state().doc.objects.filter((o) => o.id !== "h2").every((o) => Number.isFinite(o.x))).toBe(true);
  });

  it("R2: zero-span (identical positions) never produces NaN", () => {
    state().loadDoc(docWithRects([{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }]));
    state().select(["h0", "h1", "h2"]);
    state().distribute("h");
    expect(state().doc.objects.every((o) => Number.isFinite(o.x))).toBe(true);
  });

  it("R3: large selection distributes correctly without arg-spread overflow", () => {
    const positions = Array.from({ length: 40 }, (_, i) => ({ x: i === 39 ? 400 : i * 2, y: 0 }));
    state().loadDoc(docWithRects(positions));
    state().select(positions.map((_, i) => `h${i}`));
    state().distribute("h");
    const box = (i: number) => worldAABB(state().doc.objects.find((o) => o.id === `h${i}`)!);
    // 40 rects ×10 wide across span 0..410 → free 10, gap 10/39; gaps are equal.
    const g1 = box(1).minX - box(0).maxX;
    const g2 = box(2).minX - box(1).maxX;
    expect(g2).toBeCloseTo(g1, 6);
    expect(box(0).minX).toBeCloseTo(0, 6);
    expect(box(39).maxX).toBeCloseTo(410, 6);
  });
});

describe("copy / cut / paste", () => {
  it("copies and pastes with fresh ids, offset, and selects the paste", () => {
    const id = state().addObject({ geo: rect(), init: { x: 10, y: 10 } });
    state().select([id]);
    state().copy();
    state().paste();
    expect(state().doc.objects).toHaveLength(2);
    const pasted = state().doc.objects.find((o) => o.id !== id)!;
    expect(pasted.id).not.toBe(id);
    expect(state().selection).toEqual([pasted.id]);
    expect(pasted.x).not.toBe(10); // offset
  });

  it("pastes onto a different page (cross-page clipboard)", () => {
    const id = state().addObject({ geo: rect(), init: { x: 5, y: 5 } });
    state().select([id]);
    state().copy();
    state().addPage();
    expect(state().doc.objects).toHaveLength(0);
    state().paste();
    expect(state().doc.objects).toHaveLength(1);
    expect(state().pages[0].objects).toHaveLength(1); // original page unchanged
  });

  it("cut removes the originals and pastes them back elsewhere", () => {
    const id = state().addObject({ geo: rect() });
    state().select([id]);
    state().cut();
    expect(state().doc.objects).toHaveLength(0);
    state().paste();
    expect(state().doc.objects).toHaveLength(1);
  });

  it("preserves fill/opacity and re-groups as an independent group", () => {
    const [a, b] = state().addObjects([{ geo: rect() }, { geo: rect() }]);
    state().setStyle([a], { fill: "#FF8FA3" });
    state().select([a, b]);
    state().group();
    const gid = state().doc.objects.find((o) => o.id === a)!.groupId;
    state().copy();
    state().paste();
    const pasted = state().doc.objects.filter((o) => o.id !== a && o.id !== b);
    expect(pasted).toHaveLength(2);
    expect(pasted.some((o) => o.style?.fill === "#FF8FA3")).toBe(true);
    const pastedGid = pasted[0].groupId;
    expect(pastedGid).toBeTruthy();
    expect(pastedGid).not.toBe(gid); // its own group
    expect(pasted.every((o) => o.groupId === pastedGid)).toBe(true);
  });

  it("paste with an empty clipboard is a no-op", () => {
    const id = state().addObject({ geo: rect() });
    state().paste();
    expect(state().doc.objects.map((o) => o.id)).toEqual([id]);
  });

  // --- Adversarial hardening -----------------------------------------------

  it("R1: pasting an image onto a page without a reference layer creates one (invariant holds)", () => {
    const [imgId] = state().addObjects([{ geo: image }]);
    state().select([imgId]);
    state().copy();
    state().addPage(); // fresh page: cut + score layers, no print layer
    state().paste();
    const pasted = state().doc.objects[0];
    const layer = state().doc.layers.find((l) => l.id === pasted.layerId)!;
    expect(pasted.geo.kind).toBe("image");
    expect(layer.operation).toBe("print"); // image never lands on a cut layer
  });

  it("R2: clipboard is a snapshot and pastes are independent", () => {
    const id = state().addObject({ geo: rect(), init: { x: 10, y: 10 } });
    state().select([id]);
    state().copy();
    state().setPosition(100, 100); // move the original AFTER copying
    state().paste();
    const first = state().doc.objects.find((o) => o.id !== id)!;
    expect(first.x).toBeCloseTo(15, 6); // 10 (snapshot) + 5, not 105
    state().paste();
    const ids = state().doc.objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length); // no id collisions across pastes
  });

  it("R3: a hostile clipboard (shape tagged with a reference-layer id, NaN coord) can't corrupt the model", () => {
    const [imgId] = state().addObjects([{ geo: image }]);
    const printLayer = state().doc.layers.find((l) => l.id === state().doc.objects.find((o) => o.id === imgId)!.layerId)!;
    // Inject a hand-crafted clipboard: a SHAPE claiming to live on the print layer.
    useEditor.setState({
      clipboard: [
        {
          id: "evil",
          name: "evil",
          layerId: printLayer.id,
          geo: { kind: "rect", width: 10, height: 10, cornerRadius: 0 },
          x: Number.NaN,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
      ],
    });
    expect(() => state().paste()).not.toThrow();
    const pasted = state().doc.objects.find((o) => o.name === "evil")!;
    const layer = state().doc.layers.find((l) => l.id === pasted.layerId)!;
    expect(layer.operation).not.toBe("print"); // a shape is never placed on a reference layer
    expect(pasted.id).not.toBe("evil"); // fresh id, never the injected one
  });
});

describe("guides", () => {
  it("adds guides per axis, sorted, and clears them", () => {
    state().addGuide("x", 50);
    state().addGuide("x", 10);
    state().addGuide("y", 30);
    expect(state().guidesX).toEqual([10, 50]);
    expect(state().guidesY).toEqual([30]);
    state().clearGuides();
    expect(state().guidesX).toEqual([]);
    expect(state().guidesY).toEqual([]);
  });

  it("R1: ignores non-finite positions", () => {
    state().addGuide("x", Number.NaN);
    state().addGuide("x", Infinity);
    expect(state().guidesX).toEqual([]);
  });

  it("R2: de-duplicates near-identical guides", () => {
    state().addGuide("x", 20);
    state().addGuide("x", 20.02); // within 0.05 mm
    expect(state().guidesX).toEqual([20]);
  });

  it("R3: caps the number of guides", () => {
    for (let i = 0; i < 100; i++) state().addGuide("x", i);
    expect(state().guidesX.length).toBe(64);
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
