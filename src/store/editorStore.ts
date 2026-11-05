import { create } from "zustand";
import { buildCutPlan } from "@/lib/doc/cutPlan";
import { OPERATION_LABEL, createDefaultDoc, createLayer } from "@/lib/doc/defaults";
import {
  applyCanvasTransform,
  bboxCenter,
  flipHorizontal,
  flipVertical,
  moveObjectTo,
  resizeObjectTo,
  translateObject,
  unionBBox,
  worldAABB,
} from "@/lib/doc/geometry";
import { newId } from "@/lib/doc/ids";
import { MAT_PRESETS, MAX_MAT_MM, MIN_MAT_MM, MAT_GUTTER } from "@/lib/doc/mats";
import type {
  DesignObject,
  Doc,
  FontId,
  Geometry,
  GeometryKind,
  Layer,
  MatPresetId,
  Operation,
  Transform,
  Unit,
} from "@/lib/doc/types";
import { clamp } from "@/lib/doc/units";
import { loadFont, textOutline } from "@/lib/text/fonts";

export type Tool = "select" | "rect" | "ellipse" | "pen" | "text" | "hand";

/** `scale` is screen pixels per millimetre; (tx, ty) is where the mat origin sits on screen. */
export interface View {
  scale: number;
  tx: number;
  ty: number;
}

export interface Notice {
  id: number;
  kind: "info" | "error";
  message: string;
}

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vmiddle" | "bottom";
export type StackMode = "front" | "forward" | "backward" | "back";

export const MIN_SCALE = 0.15;
export const MAX_SCALE = 60;
const HISTORY_LIMIT = 100;
const COALESCE_MS = 900;

interface CommitOptions {
  /** Consecutive commits with the same key inside a short window share one undo step. */
  coalesce?: string;
}

export interface NewObject {
  geo: Geometry;
  name?: string;
  layerId?: string;
  init?: Partial<Transform>;
}

interface EditorState {
  doc: Doc;
  past: Doc[];
  future: Doc[];
  coalesce: { key: string; at: number } | null;

  selection: string[];
  activeLayerId: string;
  tool: Tool;

  view: View;
  viewport: { width: number; height: number };

  preview: { runId: number } | null;
  notice: Notice | null;
  importOpen: boolean;
  importFile: File | null;
  /** Bumped to ask the inspector to focus the text field. */
  textFocusTick: number;
  panelsOpen: boolean;
  /** Last pointer position on the mat, in millimetres. */
  cursor: { x: number; y: number } | null;

  // document
  commitDoc: (fn: (doc: Doc) => Doc, opts?: CommitOptions) => void;
  undo: () => void;
  redo: () => void;
  loadDoc: (doc: Doc) => void;
  newDoc: () => void;
  setName: (name: string) => void;
  setUnit: (unit: Unit) => void;
  setMat: (patch: { preset?: MatPresetId; width?: number; height?: number }) => void;

  // objects
  addObjects: (items: NewObject[]) => string[];
  addObject: (item: NewObject) => string;
  removeObjects: (ids: readonly string[]) => void;
  duplicateObjects: (ids: readonly string[]) => void;
  setTransforms: (updates: ReadonlyArray<Transform & { id: string }>) => void;
  mapObjects: (ids: readonly string[], fn: (o: DesignObject) => DesignObject, coalesce?: string) => void;
  nudge: (dx: number, dy: number) => void;
  setPosition: (x?: number, y?: number) => void;
  setSize: (size: { width?: number; height?: number }, keepAspect: boolean) => void;
  setRotation: (deg: number) => void;
  flip: (axis: "x" | "y") => void;
  align: (mode: AlignMode) => void;
  restack: (mode: StackMode) => void;
  renameObject: (id: string, name: string) => void;
  moveToLayer: (ids: readonly string[], layerId: string) => void;
  setRectRadius: (radius: number) => void;
  setTextProps: (id: string, patch: Partial<{ text: string; fontId: FontId; size: number; letterSpacing: number }>) => Promise<void>;
  createText: (x: number, y: number, text?: string) => Promise<string | null>;

  // layers
  addLayer: (operation: Operation) => string;
  updateLayer: (id: string, patch: Partial<Pick<Layer, "name" | "color" | "visible" | "locked" | "operation">>) => boolean;
  removeLayer: (id: string) => void;
  reorderLayers: (topFirstIds: readonly string[]) => void;
  setActiveLayer: (id: string) => void;

  // selection
  select: (ids: readonly string[], additive?: boolean) => void;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // view and chrome
  setTool: (tool: Tool) => void;
  setView: (view: View) => void;
  setViewport: (width: number, height: number) => void;
  zoomAt: (factor: number, cx: number, cy: number) => void;
  fitView: () => void;
  setCursor: (p: { x: number; y: number } | null) => void;
  startPreview: () => void;
  stopPreview: () => void;
  notify: (kind: Notice["kind"], message: string) => void;
  dismissNotice: () => void;
  openImport: (file?: File | null) => void;
  closeImport: () => void;
  setPanelsOpen: (open: boolean) => void;
}

let noticeSeq = 0;

function nameFor(doc: Doc, geo: Geometry): string {
  if (geo.kind === "text") {
    const label = geo.text.trim().split("\n")[0].slice(0, 24);
    return label || "Text";
  }
  const base: Record<Exclude<GeometryKind, "text">, string> = {
    rect: "Rectangle",
    ellipse: "Ellipse",
    path: "Path",
    image: "Artwork",
  };
  const n = doc.objects.filter((o) => o.geo.kind === geo.kind).length + 1;
  return `${base[geo.kind]} ${n}`;
}

function existingIds(doc: Doc, ids: readonly string[]): string[] {
  const set = new Set(doc.objects.map((o) => o.id));
  return ids.filter((id) => set.has(id));
}

/** The layer new shapes should land on: the first cut layer, else the first drawable one. */
function defaultActiveLayer(doc: Doc): string {
  return (
    doc.layers.find((l) => l.operation === "cut") ??
    doc.layers.find((l) => l.operation !== "print") ??
    doc.layers[0]
  ).id;
}

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

export const useEditor = create<EditorState>()((set, get) => {
  const selectedObjects = (): DesignObject[] => {
    const { doc, selection } = get();
    const ids = new Set(selection);
    return doc.objects.filter((o) => ids.has(o.id));
  };

  const initial = createDefaultDoc();

  return {
    doc: initial,
    past: [],
    future: [],
    coalesce: null,
    selection: [],
    activeLayerId: defaultActiveLayer(initial),
    tool: "select",
    view: { scale: 2, tx: 0, ty: 0 },
    viewport: { width: 0, height: 0 },
    preview: null,
    notice: null,
    importOpen: false,
    importFile: null,
    textFocusTick: 0,
    panelsOpen: false,
    cursor: null,

    // ----------------------------------------------------------------- document

    commitDoc: (fn, opts) =>
      set((s) => {
        const next = fn(s.doc);
        if (next === s.doc) return s;
        const now = Date.now();
        const merge = !!opts?.coalesce && s.coalesce?.key === opts.coalesce && now - s.coalesce.at < COALESCE_MS;
        const past = merge ? s.past : [...s.past.slice(-(HISTORY_LIMIT - 1)), s.doc];
        const layerOk = next.layers.some((l) => l.id === s.activeLayerId);
        return {
          doc: next,
          past,
          future: [],
          coalesce: opts?.coalesce ? { key: opts.coalesce, at: now } : null,
          selection: existingIds(next, s.selection),
          activeLayerId: layerOk ? s.activeLayerId : defaultActiveLayer(next),
        };
      }),

    undo: () =>
      set((s) => {
        const prev = s.past[s.past.length - 1];
        if (!prev) return s;
        const layerOk = prev.layers.some((l) => l.id === s.activeLayerId);
        return {
          doc: prev,
          past: s.past.slice(0, -1),
          future: [s.doc, ...s.future].slice(0, HISTORY_LIMIT),
          coalesce: null,
          selection: existingIds(prev, s.selection),
          activeLayerId: layerOk ? s.activeLayerId : defaultActiveLayer(prev),
        };
      }),

    redo: () =>
      set((s) => {
        const next = s.future[0];
        if (!next) return s;
        return {
          doc: next,
          past: [...s.past, s.doc].slice(-HISTORY_LIMIT),
          future: s.future.slice(1),
          coalesce: null,
          selection: existingIds(next, s.selection),
        };
      }),

    loadDoc: (doc) => {
      set({
        doc,
        past: [],
        future: [],
        coalesce: null,
        selection: [],
        activeLayerId: defaultActiveLayer(doc),
        preview: null,
        tool: "select",
      });
      get().fitView();
    },

    newDoc: () => get().loadDoc(createDefaultDoc()),

    setName: (name) => get().commitDoc((d) => (d.name === name ? d : { ...d, name }), { coalesce: "name" }),

    setUnit: (unit) => get().commitDoc((d) => (d.unit === unit ? d : { ...d, unit })),

    setMat: (patch) => {
      get().commitDoc((d) => {
        let { preset, width, height } = d.mat;
        if (patch.preset && patch.preset !== "custom") {
          const p = MAT_PRESETS.find((m) => m.id === patch.preset);
          if (p) ({ id: preset, width, height } = p);
        } else {
          if (patch.width !== undefined) width = clamp(patch.width, MIN_MAT_MM, MAX_MAT_MM);
          if (patch.height !== undefined) height = clamp(patch.height, MIN_MAT_MM, MAX_MAT_MM);
          preset = "custom";
        }
        if (preset === d.mat.preset && width === d.mat.width && height === d.mat.height) return d;
        return { ...d, mat: { preset, width, height } };
      }, { coalesce: "mat" });
      get().fitView();
    },

    // ------------------------------------------------------------------ objects

    addObjects: (items) => {
      const ids: string[] = [];
      let usedLayer = "";
      get().commitDoc((doc) => {
        let layers = doc.layers;
        const objects = [...doc.objects];
        const active = get().activeLayerId;

        const layerFor = (kind: GeometryKind): string => {
          if (kind === "image") {
            const found = layers.find((l) => l.operation === "print");
            if (found) return found.id;
            const art = createLayer("print", "Artwork");
            layers = [art, ...layers];
            return art.id;
          }
          const pick =
            layers.find((l) => l.id === active && l.operation !== "print") ??
            layers.find((l) => l.operation === "cut") ??
            layers.find((l) => l.operation !== "print");
          if (pick) return pick.id;
          const cut = createLayer("cut");
          layers = [...layers, cut];
          return cut.id;
        };

        for (const item of items) {
          const id = newId();
          const layerId = item.layerId ?? layerFor(item.geo.kind);
          if (item.geo.kind !== "image") usedLayer = layerId;
          ids.push(id);
          objects.push({
            id,
            name: item.name ?? nameFor({ ...doc, objects }, item.geo),
            layerId,
            ...DEFAULT_TRANSFORM,
            ...item.init,
            geo: item.geo,
          });
        }
        return { ...doc, layers, objects };
      });

      const added = new Set(ids);
      const doc = get().doc;
      const solid = doc.objects.filter((o) => added.has(o.id) && o.geo.kind !== "image").map((o) => o.id);
      set({ selection: solid.length ? solid : ids, ...(usedLayer ? { activeLayerId: usedLayer } : {}) });
      return ids;
    },

    addObject: (item) => get().addObjects([item])[0],

    removeObjects: (ids) => {
      const drop = new Set(ids);
      if (drop.size === 0) return;
      get().commitDoc((d) => ({ ...d, objects: d.objects.filter((o) => !drop.has(o.id)) }));
    },

    duplicateObjects: (ids) => {
      const want = new Set(ids);
      const copies: string[] = [];
      get().commitDoc((d) => {
        const extra: DesignObject[] = [];
        for (const o of d.objects) {
          if (!want.has(o.id)) continue;
          const id = newId();
          copies.push(id);
          extra.push({ ...translateObject(o, 5, 5), id, name: `${o.name} copy` });
        }
        return extra.length ? { ...d, objects: [...d.objects, ...extra] } : d;
      });
      if (copies.length) set({ selection: copies });
    },

    setTransforms: (updates) => {
      const byId = new Map(updates.map((u) => [u.id, u] as const));
      get().commitDoc((d) => ({
        ...d,
        objects: d.objects.map((o) => {
          const u = byId.get(o.id);
          return u ? applyCanvasTransform(o, u) : o;
        }),
      }));
    },

    mapObjects: (ids, fn, coalesce) => {
      const want = new Set(ids);
      get().commitDoc((d) => ({ ...d, objects: d.objects.map((o) => (want.has(o.id) ? fn(o) : o)) }), { coalesce });
    },

    nudge: (dx, dy) => get().mapObjects(get().selection, (o) => translateObject(o, dx, dy), "nudge"),

    setPosition: (x, y) => {
      const objs = selectedObjects();
      if (objs.length === 0) return;
      const box = unionBBox(objs.map(worldAABB));
      if (!box) return;
      const dx = x === undefined ? 0 : x - box.minX;
      const dy = y === undefined ? 0 : y - box.minY;
      get().mapObjects(get().selection, (o) => translateObject(o, dx, dy), "position");
    },

    setSize: (size, keepAspect) => {
      const objs = selectedObjects();
      if (objs.length !== 1) return;
      get().mapObjects([objs[0].id], (o) => resizeObjectTo(o, size, keepAspect), "size");
    },

    setRotation: (deg) => get().mapObjects(get().selection, (o) => ({ ...o, rotation: deg }), "rotation"),

    flip: (axis) => get().mapObjects(get().selection, axis === "x" ? flipHorizontal : flipVertical),

    align: (mode) => {
      const objs = selectedObjects();
      if (objs.length === 0) return;
      const { mat } = get().doc;
      const frame =
        objs.length > 1
          ? unionBBox(objs.map(worldAABB))!
          : { minX: 0, minY: 0, maxX: mat.width, maxY: mat.height };
      const target = bboxCenter(frame);
      get().mapObjects(get().selection, (o) => {
        const b = worldAABB(o);
        const c = bboxCenter(b);
        switch (mode) {
          case "left":
            return translateObject(o, frame.minX - b.minX, 0);
          case "right":
            return translateObject(o, frame.maxX - b.maxX, 0);
          case "hcenter":
            return translateObject(o, target.x - c.x, 0);
          case "top":
            return translateObject(o, 0, frame.minY - b.minY);
          case "bottom":
            return translateObject(o, 0, frame.maxY - b.maxY);
          case "vmiddle":
            return translateObject(o, 0, target.y - c.y);
        }
      });
    },

    restack: (mode) => {
      const want = new Set(get().selection);
      get().commitDoc((d) => {
        const objects = [...d.objects];
        const sameLayer = (a: DesignObject, b: DesignObject) => a.layerId === b.layerId;
        const picked = objects.filter((o) => want.has(o.id));
        if (picked.length === 0) return d;

        if (mode === "front" || mode === "back") {
          const rest = objects.filter((o) => !want.has(o.id));
          return { ...d, objects: mode === "front" ? [...rest, ...picked] : [...picked, ...rest] };
        }

        const order = mode === "forward" ? [...picked].reverse() : picked;
        for (const o of order) {
          const i = objects.findIndex((x) => x.id === o.id);
          const step = mode === "forward" ? 1 : -1;
          let j = i + step;
          while (j >= 0 && j < objects.length && !sameLayer(objects[j], o)) j += step;
          if (j < 0 || j >= objects.length || want.has(objects[j].id)) continue;
          [objects[i], objects[j]] = [objects[j], objects[i]];
        }
        return { ...d, objects };
      });
    },

    renameObject: (id, name) => get().mapObjects([id], (o) => ({ ...o, name }), `rename:${id}`),

    moveToLayer: (ids, layerId) => {
      const target = get().doc.layers.find((l) => l.id === layerId);
      if (!target) return;
      const want = new Set(ids);
      const incompatible = get().doc.objects.some(
        (o) => want.has(o.id) && (o.geo.kind === "image") !== (target.operation === "print"),
      );
      if (incompatible) {
        get().notify(
          "error",
          target.operation === "print"
            ? "Reference layers only hold images. Pick a cut, score or draw layer for shapes."
            : "Images can only go on a reference layer.",
        );
        return;
      }
      get().mapObjects(ids, (o) => ({ ...o, layerId }));
      set({ activeLayerId: layerId });
    },

    setRectRadius: (radius) =>
      get().mapObjects(
        get().selection,
        (o) => {
          if (o.geo.kind !== "rect") return o;
          const max = Math.min(o.geo.width, o.geo.height) / 2;
          return { ...o, geo: { ...o.geo, cornerRadius: clamp(radius, 0, max) } };
        },
        "radius",
      ),

    setTextProps: async (id, patch) => {
      const current = get().doc.objects.find((o) => o.id === id);
      if (!current || current.geo.kind !== "text") return;
      const next = { ...current.geo, ...patch };
      try {
        const font = await loadFont(next.fontId);
        const outline = textOutline(font, next.text, next.size, next.letterSpacing);
        get().mapObjects(
          [id],
          (o) => {
            if (o.geo.kind !== "text") return o;
            const before = worldAABB(o);
            const updated: DesignObject = {
              ...o,
              name: patch.text !== undefined ? nameFor(get().doc, { ...next, ...outline }) : o.name,
              geo: { ...next, ...outline },
            };
            // Keep the top-left corner of the text where it was.
            const after = worldAABB(updated);
            return translateObject(updated, before.minX - after.minX, before.minY - after.minY);
          },
          `text:${id}`,
        );
      } catch (err) {
        get().notify("error", err instanceof Error ? err.message : "Couldn't update the text.");
      }
    },

    createText: async (x, y, text = "Sticker") => {
      try {
        const fontId: FontId = "lilita";
        const size = 28;
        const font = await loadFont(fontId);
        const outline = textOutline(font, text, size, 0);
        const id = get().addObject({
          geo: { kind: "text", text, fontId, size, letterSpacing: 0, ...outline },
          init: { x: x - outline.width / 2, y: y - outline.height / 2 },
        });
        set({ tool: "select", textFocusTick: get().textFocusTick + 1 });
        return id;
      } catch (err) {
        get().notify("error", err instanceof Error ? err.message : "Couldn't add text.");
        return null;
      }
    },

    // ------------------------------------------------------------------- layers

    addLayer: (operation) => {
      const same = get().doc.layers.filter((l) => l.operation === operation).length;
      const label = OPERATION_LABEL[operation];
      const layer = createLayer(operation, same > 0 ? `${label} ${same + 1}` : label);
      get().commitDoc((d) => ({ ...d, layers: [...d.layers, layer] }));
      set({ activeLayerId: layer.id });
      return layer.id;
    },

    updateLayer: (id, patch) => {
      const layer = get().doc.layers.find((l) => l.id === id);
      if (!layer) return false;
      if (patch.operation && patch.operation !== layer.operation) {
        const holds = get().doc.objects.filter((o) => o.layerId === id);
        const hasImage = holds.some((o) => o.geo.kind === "image");
        const hasShape = holds.some((o) => o.geo.kind !== "image");
        if ((patch.operation === "print" && hasShape) || (patch.operation !== "print" && hasImage)) {
          get().notify(
            "error",
            patch.operation === "print"
              ? "This layer has shapes on it. Move them to another layer before making it a reference layer."
              : "This layer has images on it. Move them off before changing it to a cutting layer.",
          );
          return false;
        }
      }
      get().commitDoc(
        (d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }),
        patch.name !== undefined ? { coalesce: `layer-name:${id}` } : undefined,
      );
      return true;
    },

    removeLayer: (id) => {
      const { doc } = get();
      if (doc.layers.length <= 1) {
        get().notify("info", "A design needs at least one layer.");
        return;
      }
      get().commitDoc((d) => ({
        ...d,
        layers: d.layers.filter((l) => l.id !== id),
        objects: d.objects.filter((o) => o.layerId !== id),
      }));
    },

    reorderLayers: (topFirstIds) => {
      get().commitDoc((d) => {
        const byId = new Map(d.layers.map((l) => [l.id, l] as const));
        const next = [...topFirstIds].reverse().map((id) => byId.get(id)).filter((l): l is Layer => !!l);
        if (next.length !== d.layers.length) return d;
        if (next.every((l, i) => l === d.layers[i])) return d;
        return { ...d, layers: next };
      });
    },

    setActiveLayer: (id) => set({ activeLayerId: id }),

    // ---------------------------------------------------------------- selection

    select: (ids, additive = false) =>
      set((s) => {
        const valid = existingIds(s.doc, ids);
        return { selection: additive ? Array.from(new Set([...s.selection, ...valid])) : valid };
      }),

    toggleSelect: (id) =>
      set((s) => ({
        selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id],
      })),

    selectAll: () =>
      set((s) => {
        const open = new Set(s.doc.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
        return { selection: s.doc.objects.filter((o) => open.has(o.layerId)).map((o) => o.id) };
      }),

    clearSelection: () => set({ selection: [] }),

    // ----------------------------------------------------------- view and chrome

    setTool: (tool) => set({ tool }),

    setView: (view) => set({ view }),

    setViewport: (width, height) => {
      const first = get().viewport.width === 0;
      set({ viewport: { width, height } });
      if (first && width > 0) get().fitView();
    },

    zoomAt: (factor, cx, cy) =>
      set((s) => {
        const scale = clamp(s.view.scale * factor, MIN_SCALE, MAX_SCALE);
        const k = scale / s.view.scale;
        return { view: { scale, tx: cx - (cx - s.view.tx) * k, ty: cy - (cy - s.view.ty) * k } };
      }),

    fitView: () => {
      const { viewport, doc } = get();
      if (viewport.width <= 0 || viewport.height <= 0) return;
      const pad = viewport.width < 640 ? 16 : 56;
      const totalW = doc.mat.width + MAT_GUTTER.left + MAT_GUTTER.right;
      const totalH = doc.mat.height + MAT_GUTTER.top + MAT_GUTTER.bottom;
      const scale = clamp(
        Math.min((viewport.width - pad * 2) / totalW, (viewport.height - pad * 2) / totalH),
        MIN_SCALE,
        MAX_SCALE,
      );
      set({
        view: {
          scale,
          tx: (viewport.width - totalW * scale) / 2 + MAT_GUTTER.left * scale,
          ty: (viewport.height - totalH * scale) / 2 + MAT_GUTTER.top * scale,
        },
      });
    },

    setCursor: (cursor) => set({ cursor }),

    startPreview: () => {
      const plan = buildCutPlan(get().doc);
      if (plan.totalLength <= 0) {
        get().notify("info", "Nothing to preview yet. Add a shape to a cut, score or draw layer first.");
        return;
      }
      set((s) => ({ preview: { runId: (s.preview?.runId ?? 0) + 1 }, selection: [] }));
    },

    stopPreview: () => set({ preview: null }),

    notify: (kind, message) => set({ notice: { id: ++noticeSeq, kind, message } }),

    dismissNotice: () => set({ notice: null }),

    openImport: (file = null) => set({ importOpen: true, importFile: file }),

    closeImport: () => set({ importOpen: false, importFile: null }),

    setPanelsOpen: (panelsOpen) => set({ panelsOpen }),
  };
});

/** Convenience for components that only need the selected objects. */
export function selectedObjectsOf(state: Pick<EditorState, "doc" | "selection">): DesignObject[] {
  const ids = new Set(state.selection);
  return state.doc.objects.filter((o) => ids.has(o.id));
}
