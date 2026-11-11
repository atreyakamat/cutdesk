import { create } from "zustand";
import { buildCutPlan } from "@/lib/doc/cutPlan";
import { OPERATION_LABEL, createDefaultDoc, createLayer } from "@/lib/doc/defaults";
import {
  applyCanvasTransform,
  bboxCenter,
  flipHorizontal,
  flipVertical,
  invertMatrix,
  matrixOf,
  resizeObjectTo,
  translateObject,
  unionBBox,
  worldAABB,
  worldPolylines,
} from "@/lib/doc/geometry";
import { booleanRings, offsetRings, pointInRing, ringArea, ringsBBox, ringsToPathData, type BooleanOp, type Ring } from "@/lib/doc/clip";
import { deleteNode, flattenSegs, insertNode, moveAnchor, moveHandle, nearestOnPath, parsePath, segsBBox, serializePath, transformPoint, type Seg } from "@/lib/doc/pathData";
import { arcWarpPath } from "@/lib/doc/arcWarp";
import { nestBoxes } from "@/lib/doc/nest";
import { parseSvg } from "@/lib/svg/importSvg";
import { qrPath } from "@/lib/doc/qr";
import { code39Path } from "@/lib/doc/barcode";
import { monogramFrame, type FrameKind } from "@/lib/doc/monogram";
import { newId } from "@/lib/doc/ids";
import type { Project } from "@/lib/doc/project";
import { MAT_PRESETS, MAX_MAT_MM, MIN_MAT_MM, MAT_GUTTER } from "@/lib/doc/mats";
import type {
  DesignObject,
  Doc,
  FontId,
  Geometry,
  GeometryKind,
  Layer,
  MatPresetId,
  ObjectStyle,
  Operation,
  Transform,
  Unit,
} from "@/lib/doc/types";
import { clamp } from "@/lib/doc/units";
import { loadFont, textOutline } from "@/lib/text/fonts";
import type { SaveStatus } from "@/lib/ui/saveStatus";

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

  /** All pages of the project. `pages[activePage]` is always the live `doc`. */
  pages: Doc[];
  activePage: number;
  /** Per-page undo stacks for the pages that aren't active. */
  pageHist: { past: Doc[]; future: Doc[] }[];

  selection: string[];
  activeLayerId: string;
  tool: Tool;

  view: View;
  viewport: { width: number; height: number };

  /** In-app clipboard (survives page switches, enabling cross-page paste). */
  clipboard: DesignObject[] | null;
  preview: { runId: number } | null;
  notice: Notice | null;
  importOpen: boolean;
  importFile: File | null;
  templatesOpen: boolean;
  helpOpen: boolean;
  generatorOpen: boolean;
  saveStatus: SaveStatus;
  /** Bumped to ask the inspector to focus the text field. */
  textFocusTick: number;
  panelsOpen: boolean;
  /** Top-level workspace mode: "design" (Canva-style) or "cut" (Cricut). */
  mode: "design" | "cut";
  /** Rulers + guides (guides are in mm; session-only, not saved to the file). */
  showRulers: boolean;
  snapToGrid: boolean;
  gridMm: number;
  guidesX: number[];
  guidesY: number[];
  /** Canvas right-click menu anchor, in client (screen) pixels. */
  contextMenu: { x: number; y: number } | null;
  /** Last pointer position on the mat, in millimetres. */
  cursor: { x: number; y: number } | null;
  /** Id of the path whose anchor points are being edited, if any. */
  nodeEditId: string | null;
  /** The segment index of the selected node (for delete / handle display). */
  activeNode: number | null;

  // document
  commitDoc: (fn: (doc: Doc) => Doc, opts?: CommitOptions) => void;
  undo: () => void;
  redo: () => void;
  loadDoc: (doc: Doc) => void;
  loadProject: (project: Project) => void;
  newDoc: () => void;

  // pages
  addPage: () => void;
  addPageFromDoc: (doc: Doc) => void;
  selectPage: (index: number) => void;
  duplicatePage: (index: number) => void;
  deletePage: (index: number) => void;
  setName: (name: string) => void;
  setUnit: (unit: Unit) => void;
  setMat: (patch: { preset?: MatPresetId; width?: number; height?: number }) => void;

  // objects
  addObjects: (items: NewObject[]) => string[];
  addObject: (item: NewObject) => string;
  importSvgText: (text: string, name?: string) => void;
  addQrCode: (text: string, sizeMm?: number) => void;
  addBarcode: (text: string, heightMm?: number) => void;
  addMonogram: (text: string, fontId: FontId, frame: FrameKind) => Promise<void>;
  removeObjects: (ids: readonly string[]) => void;
  duplicateObjects: (ids: readonly string[]) => void;
  /** Change stacking order of the given objects within the document. */
  reorderObjects: (ids: readonly string[], where: "front" | "back" | "forward" | "backward") => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  setTransforms: (updates: ReadonlyArray<Transform & { id: string }>) => void;
  mapObjects: (ids: readonly string[], fn: (o: DesignObject) => DesignObject, coalesce?: string) => void;
  nudge: (dx: number, dy: number) => void;
  setPosition: (x?: number, y?: number) => void;
  setSize: (size: { width?: number; height?: number }, keepAspect: boolean) => void;
  setRotation: (deg: number) => void;
  flip: (axis: "x" | "y") => void;
  align: (mode: AlignMode) => void;
  distribute: (axis: "h" | "v") => void;
  autoNest: () => void;
  makeStickerSheet: (borderMm?: number) => void;
  outlineSelection: (deltaMm: number) => void;
  combineSelection: (op: BooleanOp) => void;
  contourSelection: () => void;
  enterNodeEdit: (id: string) => void;
  exitNodeEdit: () => void;
  moveNodeWorld: (segIndex: number, wx: number, wy: number) => void;
  insertNodeWorld: (wx: number, wy: number) => void;
  setActiveNode: (seg: number | null) => void;
  deleteActiveNode: () => void;
  moveHandleWorld: (segIndex: number, which: "in" | "out", wx: number, wy: number) => void;
  restack: (mode: StackMode) => void;
  renameObject: (id: string, name: string) => void;
  setObjectLocked: (ids: readonly string[], locked: boolean) => void;
  setObjectHidden: (ids: readonly string[], hidden: boolean) => void;
  showAllObjects: () => void;
  moveToLayer: (ids: readonly string[], layerId: string) => void;
  setRectRadius: (radius: number) => void;
  setStyle: (ids: readonly string[], patch: Partial<ObjectStyle>) => void;
  group: () => void;
  ungroup: () => void;
  setTextProps: (id: string, patch: Partial<{ text: string; fontId: FontId; size: number; letterSpacing: number; arc: number }>) => Promise<void>;
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
  setTemplatesOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setGeneratorOpen: (open: boolean) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setPanelsOpen: (open: boolean) => void;
  setMode: (mode: "design" | "cut") => void;
  setShowRulers: (show: boolean) => void;
  setSnapToGrid: (on: boolean) => void;
  addGuide: (axis: "x" | "y", mm: number) => void;
  clearGuides: () => void;
  openContextMenu: (x: number, y: number) => void;
  closeContextMenu: () => void;
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

/** Grow a set of ids to include every object in the same group. */
function expandGroups(doc: Doc, ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  const groups = new Set<string>();
  for (const o of doc.objects) {
    if (wanted.has(o.id) && o.groupId) groups.add(o.groupId);
  }
  if (groups.size === 0) return [...wanted];
  for (const o of doc.objects) {
    if (o.groupId && groups.has(o.groupId)) wanted.add(o.id);
  }
  return [...wanted];
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
    pages: [initial],
    activePage: 0,
    pageHist: [{ past: [], future: [] }],
    clipboard: null,
    selection: [],
    activeLayerId: defaultActiveLayer(initial),
    tool: "select",
    view: { scale: 2, tx: 0, ty: 0 },
    viewport: { width: 0, height: 0 },
    preview: null,
    notice: null,
    importOpen: false,
    importFile: null,
    templatesOpen: false,
    helpOpen: false,
    generatorOpen: false,
    saveStatus: "idle",
    textFocusTick: 0,
    panelsOpen: false,
    mode: "design",
    showRulers: false,
    snapToGrid: false,
    gridMm: 5,
    guidesX: [],
    guidesY: [],
    contextMenu: null,
    cursor: null,
    nodeEditId: null,
    activeNode: null,

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
          pages: s.pages.map((p, i) => (i === s.activePage ? next : p)),
          coalesce: opts?.coalesce ? { key: opts.coalesce, at: now } : null,
          selection: existingIds(next, s.selection),
          activeLayerId: layerOk ? s.activeLayerId : defaultActiveLayer(next),
          nodeEditId: s.nodeEditId && next.objects.some((o) => o.id === s.nodeEditId) ? s.nodeEditId : null,
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
          pages: s.pages.map((p, i) => (i === s.activePage ? prev : p)),
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
          pages: s.pages.map((p, i) => (i === s.activePage ? next : p)),
          coalesce: null,
          selection: existingIds(next, s.selection),
        };
      }),

    loadDoc: (doc) => {
      set({
        doc,
        past: [],
        future: [],
        pages: [doc],
        activePage: 0,
        pageHist: [{ past: [], future: [] }],
        coalesce: null,
        selection: [],
        activeLayerId: defaultActiveLayer(doc),
        preview: null,
        tool: "select",
      });
      get().fitView();
    },

    loadProject: ({ pages, activePage }) => {
      const pp = pages.length ? pages : [createDefaultDoc()];
      const active = clamp(activePage, 0, pp.length - 1);
      set({
        doc: pp[active],
        past: [],
        future: [],
        pages: pp,
        activePage: active,
        pageHist: pp.map(() => ({ past: [], future: [] })),
        coalesce: null,
        selection: [],
        activeLayerId: defaultActiveLayer(pp[active]),
        preview: null,
        tool: "select",
      });
      get().fitView();
    },

    newDoc: () => get().loadDoc(createDefaultDoc()),

    // -------------------------------------------------------------------- pages

    addPage: () => {
      const page = createDefaultDoc();
      page.name = `Page ${get().pages.length + 1}`;
      get().addPageFromDoc(page);
    },

    addPageFromDoc: (page) => {
      set((s) => {
        const pages = s.pages.map((p, i) => (i === s.activePage ? s.doc : p));
        const hist = s.pageHist.map((h, i) => (i === s.activePage ? { past: s.past, future: s.future } : h));
        return {
          pages: [...pages, page],
          pageHist: [...hist, { past: [], future: [] }],
          activePage: pages.length,
          doc: page,
          past: [],
          future: [],
          coalesce: null,
          selection: [],
          activeLayerId: defaultActiveLayer(page),
          preview: null,
        };
      });
      get().fitView();
    },

    selectPage: (index) => {
      const s = get();
      if (index === s.activePage || index < 0 || index >= s.pages.length) return;
      const pages = s.pages.map((p, i) => (i === s.activePage ? s.doc : p));
      const hist = s.pageHist.map((h, i) => (i === s.activePage ? { past: s.past, future: s.future } : h));
      const target = pages[index];
      const th = hist[index] ?? { past: [], future: [] };
      set({
        pages,
        pageHist: hist,
        activePage: index,
        doc: target,
        past: th.past,
        future: th.future,
        coalesce: null,
        selection: [],
        activeLayerId: defaultActiveLayer(target),
        preview: null,
      });
      get().fitView();
    },

    duplicatePage: (index) => {
      const s = get();
      if (index < 0 || index >= s.pages.length) return;
      const pages = s.pages.map((p, i) => (i === s.activePage ? s.doc : p));
      const hist = s.pageHist.map((h, i) => (i === s.activePage ? { past: s.past, future: s.future } : h));
      // Fresh ids so the copy is independent of the original.
      const source = pages[index];
      const copy: Doc = {
        ...source,
        name: `${source.name} copy`,
        layers: source.layers.map((l) => ({ ...l })),
        objects: source.objects.map((o) => ({ ...o, id: newId() })),
      };
      const at = index + 1;
      const nextPages = [...pages.slice(0, at), copy, ...pages.slice(at)];
      const nextHist = [...hist.slice(0, at), { past: [], future: [] }, ...hist.slice(at)];
      set({
        pages: nextPages,
        pageHist: nextHist,
        activePage: at,
        doc: copy,
        past: [],
        future: [],
        coalesce: null,
        selection: [],
        activeLayerId: defaultActiveLayer(copy),
        preview: null,
      });
      get().fitView();
    },

    deletePage: (index) => {
      const s = get();
      if (s.pages.length <= 1 || index < 0 || index >= s.pages.length) {
        if (s.pages.length <= 1) get().notify("info", "A project needs at least one page.");
        return;
      }
      const pages = s.pages.map((p, i) => (i === s.activePage ? s.doc : p));
      const hist = s.pageHist.map((h, i) => (i === s.activePage ? { past: s.past, future: s.future } : h));
      const nextPages = pages.filter((_, i) => i !== index);
      const nextHist = hist.filter((_, i) => i !== index);
      // Keep the active page selected; shift if it was after the removed one.
      let active = s.activePage;
      if (index === s.activePage) active = Math.min(index, nextPages.length - 1);
      else if (index < s.activePage) active = s.activePage - 1;
      const target = nextPages[active];
      const th = nextHist[active] ?? { past: [], future: [] };
      set({
        pages: nextPages,
        pageHist: nextHist,
        activePage: active,
        doc: target,
        past: th.past,
        future: th.future,
        coalesce: null,
        selection: [],
        activeLayerId: defaultActiveLayer(target),
        preview: null,
      });
      get().fitView();
    },

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

    addQrCode: (text, sizeMm = 40) => {
      const { d, width, height } = qrPath(text, { sizeMm });
      if (!d) {
        get().notify("error", "Couldn't make a QR code from that.");
        return;
      }
      const { mat } = get().doc;
      get().addObject({ geo: { kind: "path", d }, name: "QR code", init: { x: Math.max(0, (mat.width - width) / 2), y: Math.max(0, (mat.height - height) / 2) } });
    },

    addBarcode: (text, heightMm = 20) => {
      const { d, width, height, text: encoded } = code39Path(text, { heightMm });
      if (!d || !encoded) {
        get().notify("error", "Nothing to encode — Code 39 takes A–Z, 0–9 and - . $ / + %.");
        return;
      }
      const { mat } = get().doc;
      get().addObject({ geo: { kind: "path", d }, name: `Barcode ${encoded}`, init: { x: Math.max(0, (mat.width - width) / 2), y: Math.max(0, (mat.height - height) / 2) } });
    },

    importSvgText: (text, name = "SVG") => {
      const { mat } = get().doc;
      const parsed = parseSvg(text, { sizeMm: Math.min(mat.width, mat.height) * 0.6 });
      if (parsed.paths.length === 0) {
        get().notify("error", "No shapes found in that SVG. Try tracing it as an image instead.");
        return;
      }
      const ox = Math.max(0, (mat.width - parsed.width) / 2);
      const oy = Math.max(0, (mat.height - parsed.height) / 2);
      const items: NewObject[] = parsed.paths.map((p, i) => ({
        geo: { kind: "path", d: p.d },
        name: parsed.paths.length > 1 ? `${name} ${i + 1}` : name,
        init: { x: ox + p.x, y: oy + p.y },
      }));
      get().addObjects(items);
      get().notify("info", `Imported ${items.length} path${items.length === 1 ? "" : "s"} from ${name}.`);
    },

    removeObjects: (ids) => {
      const drop = new Set(ids);
      if (drop.size === 0) return;
      // Locked objects are kept even if in the set.
      get().commitDoc((d) => ({ ...d, objects: d.objects.filter((o) => !drop.has(o.id) || o.locked) }));
    },

    duplicateObjects: (ids) => {
      const want = new Set(ids);
      const copies: string[] = [];
      // Remap group ids so a duplicated group is its own group, not merged with the original.
      const groupMap = new Map<string, string>();
      get().commitDoc((d) => {
        const extra: DesignObject[] = [];
        for (const o of d.objects) {
          if (!want.has(o.id)) continue;
          const id = newId();
          copies.push(id);
          let groupId = o.groupId;
          if (groupId) {
            if (!groupMap.has(groupId)) groupMap.set(groupId, newId());
            groupId = groupMap.get(groupId);
          }
          extra.push({ ...translateObject(o, 5, 5), id, name: `${o.name} copy`, groupId });
        }
        return extra.length ? { ...d, objects: [...d.objects, ...extra] } : d;
      });
      if (copies.length) set({ selection: copies });
    },

    reorderObjects: (ids, where) => {
      const sel = new Set(ids);
      if (sel.size === 0) return;
      get().commitDoc((d) => {
        if (!d.objects.some((o) => sel.has(o.id))) return d;
        if (where === "front") {
          const rest = d.objects.filter((o) => !sel.has(o.id));
          const picked = d.objects.filter((o) => sel.has(o.id));
          return { ...d, objects: [...rest, ...picked] };
        }
        if (where === "back") {
          const rest = d.objects.filter((o) => !sel.has(o.id));
          const picked = d.objects.filter((o) => sel.has(o.id));
          return { ...d, objects: [...picked, ...rest] };
        }
        // One step: move each selected object past its nearest unselected neighbour.
        const next = d.objects.slice();
        if (where === "forward") {
          for (let i = next.length - 2; i >= 0; i--) {
            if (sel.has(next[i].id) && !sel.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]];
          }
        } else {
          for (let i = 1; i < next.length; i++) {
            if (sel.has(next[i].id) && !sel.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]];
          }
        }
        return { ...d, objects: next };
      });
    },

    copy: () => {
      const objs = selectedObjects();
      if (objs.length === 0) return;
      // Deep-ish copy so later edits to the originals don't mutate the clipboard.
      set({
        clipboard: objs.map((o) => ({ ...o, geo: { ...o.geo }, style: o.style ? { ...o.style } : undefined })),
      });
    },

    cut: () => {
      const objs = selectedObjects();
      if (objs.length === 0) return;
      get().copy();
      get().removeObjects(objs.map((o) => o.id));
    },

    paste: () => {
      const clip = get().clipboard;
      if (!clip || clip.length === 0) return;
      const pastedIds: string[] = [];
      const groupMap = new Map<string, string>();
      get().commitDoc((doc) => {
        let layers = doc.layers;
        const objects = [...doc.objects];
        const active = get().activeLayerId;

        // Resolve a target layer, enforcing the image/print invariant even when
        // pasting into a page that never had the source layer.
        const layerFor = (o: DesignObject): string => {
          const isImage = o.geo.kind === "image";
          const orig = layers.find((l) => l.id === o.layerId);
          if (orig && isImage === (orig.operation === "print")) return orig.id;
          if (isImage) {
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

        for (const src of clip) {
          const id = newId();
          pastedIds.push(id);
          let groupId = src.groupId;
          if (groupId) {
            if (!groupMap.has(groupId)) groupMap.set(groupId, newId());
            groupId = groupMap.get(groupId);
          }
          objects.push({
            ...src,
            id,
            layerId: layerFor(src),
            groupId,
            x: src.x + 5,
            y: src.y + 5,
            geo: { ...src.geo },
            style: src.style ? { ...src.style } : undefined,
          });
        }
        return { ...doc, layers, objects };
      });
      if (pastedIds.length) set({ selection: pastedIds });
    },

    addMonogram: async (text, fontId, frame) => {
      try {
        const label = text.trim() || "AB";
        const font = await loadFont(fontId);
        const size = 48;
        const outline = textOutline(font, label, size, 0);
        const { mat } = get().doc;
        const pad = Math.max(outline.width, outline.height) * 0.3 + 8;
        const tx = Math.max(0, (mat.width - outline.width) / 2);
        const ty = Math.max(0, (mat.height - outline.height) / 2);
        const items: NewObject[] = [];
        const fr = monogramFrame(frame, outline.width, outline.height, pad);
        if (fr) items.push({ geo: fr.geo, name: "Frame", init: { x: tx + fr.dx, y: ty + fr.dy } });
        items.push({ geo: { kind: "text", text: label, fontId, size, letterSpacing: 0, ...outline }, name: label, init: { x: tx, y: ty } });
        const ids = get().addObjects(items);
        if (ids.length > 1) {
          get().select(ids);
          get().group();
        }
        get().notify("info", `Added monogram “${label}”.`);
      } catch (err) {
        get().notify("error", err instanceof Error ? err.message : "Couldn't make the monogram.");
      }
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

    distribute: (axis) => {
      const objs = selectedObjects();
      if (objs.length < 3) return;
      const horiz = axis === "h";
      const boxes = objs.map((o) => ({ id: o.id, b: worldAABB(o) }));
      // Refuse to act on non-finite geometry rather than scatter objects to NaN.
      if (boxes.some(({ b }) => ![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite))) return;

      const lo = (b: typeof boxes[number]["b"]) => (horiz ? b.minX : b.minY);
      const hi = (b: typeof boxes[number]["b"]) => (horiz ? b.maxX : b.maxY);
      const size = (b: typeof boxes[number]["b"]) => hi(b) - lo(b);
      boxes.sort((p, q) => lo(p.b) - lo(q.b));

      const start = lo(boxes[0].b);
      // reduce, not Math.max(...spread): a huge selection would overflow the
      // call-argument limit and throw.
      const end = boxes.reduce((m, { b }) => Math.max(m, hi(b)), -Infinity);
      const totalSize = boxes.reduce((s, { b }) => s + size(b), 0);
      const gap = (end - start - totalSize) / (boxes.length - 1);

      const deltas = new Map<string, number>();
      let cursor = start;
      for (const { id, b } of boxes) {
        deltas.set(id, cursor - lo(b));
        cursor += size(b) + gap;
      }
      get().mapObjects(
        objs.map((o) => o.id),
        (o) => {
          const d = deltas.get(o.id) ?? 0;
          return horiz ? translateObject(o, d, 0) : translateObject(o, 0, d);
        },
      );
    },

    autoNest: () => {
      const objs = selectedObjects();
      if (objs.length < 2) {
        get().notify("info", "Select two or more objects to arrange them.");
        return;
      }
      // Group selected objects into units (grouped objects move together).
      const units = new Map<string, { members: DesignObject[]; box: ReturnType<typeof unionBBox> }>();
      for (const o of objs) {
        const key = o.groupId ?? o.id;
        const u = units.get(key) ?? { members: [], box: null };
        u.members.push(o);
        units.set(key, u);
      }
      for (const u of units.values()) u.box = unionBBox(u.members.map(worldAABB));
      if (units.size < 2) {
        get().notify("info", "Select two or more separate objects (or groups) to arrange.");
        return;
      }
      const { mat } = get().doc;
      const items = [...units].flatMap(([key, u]) => (u.box ? [{ id: key, w: u.box.maxX - u.box.minX, h: u.box.maxY - u.box.minY }] : []));
      const pos = nestBoxes(items, { width: mat.width, gap: 3, margin: 3 });
      get().mapObjects(get().selection, (o) => {
        const key = o.groupId ?? o.id;
        const u = units.get(key);
        const t = pos.get(key);
        if (!u || !u.box || !t) return o; // non-finite units are skipped
        return translateObject(o, t.x - u.box.minX, t.y - u.box.minY);
      });
    },

    makeStickerSheet: (borderMm = 3) => {
      const targets = selectedObjects();
      if (targets.length === 0) {
        get().notify("info", "Select the designs to turn into stickers.");
        return;
      }
      const selAll: string[] = [];
      let madeAny = false;
      get().commitDoc((d) => {
        const objects = [...d.objects];
        const cutLayerId = d.layers.find((l) => l.operation === "cut")?.id;
        for (const o of targets) {
          const rings = worldPolylines(o).map((pl) => pl.points);
          let geo: Geometry;
          let bx: number;
          let by: number;
          if (rings.length) {
            const merged = booleanRings(rings, [], "union");
            const out = offsetRings(merged.length ? merged : rings, borderMm);
            const bb = ringsBBox(out);
            if (out.length === 0 || !bb) continue;
            geo = { kind: "path", d: ringsToPathData(out.map((r) => r.map((p) => ({ x: p.x - bb.minX, y: p.y - bb.minY })))) };
            bx = bb.minX;
            by = bb.minY;
          } else {
            // No outline (e.g. an image): a rounded-rect border around the bounds.
            const b = worldAABB(o);
            const w = b.maxX - b.minX + borderMm * 2;
            const h = b.maxY - b.minY + borderMm * 2;
            geo = { kind: "rect", width: w, height: h, cornerRadius: Math.min(w, h) * 0.12 };
            bx = b.minX - borderMm;
            by = b.minY - borderMm;
          }
          const gid = o.groupId ?? newId();
          const borderId = newId();
          const idx = objects.findIndex((x) => x.id === o.id);
          objects.splice(Math.max(0, idx), 0, {
            id: borderId,
            name: `${o.name} border`,
            layerId: cutLayerId ?? o.layerId,
            ...DEFAULT_TRANSFORM,
            x: bx,
            y: by,
            geo,
            groupId: gid,
          });
          const oi = objects.findIndex((x) => x.id === o.id);
          objects[oi] = { ...objects[oi], groupId: gid };
          selAll.push(borderId, o.id);
          madeAny = true;
        }
        return madeAny ? { ...d, objects } : d;
      });
      if (!madeAny) {
        get().notify("error", "Couldn't build sticker borders for that selection.");
        return;
      }
      set({ selection: selAll });
      get().autoNest();
      get().notify("info", `Made ${targets.length} sticker${targets.length === 1 ? "" : "s"} with borders and arranged them.`);
    },

    outlineSelection: (deltaMm) => {
      const objs = selectedObjects().filter((o) => o.geo.kind !== "image");
      if (objs.length === 0) {
        get().notify("info", "Select a shape to add an outline around it.");
        return;
      }
      const rings = objs.flatMap((o) => worldPolylines(o).map((pl) => pl.points));
      const merged = booleanRings(rings, [], "union");
      const out = offsetRings(merged.length ? merged : rings, deltaMm);
      const bb = ringsBBox(out);
      if (out.length === 0 || !bb) {
        get().notify("error", "Couldn't build an outline for that shape.");
        return;
      }
      const shifted = out.map((r) => r.map((p) => ({ x: p.x - bb.minX, y: p.y - bb.minY })));
      get().addObject({ geo: { kind: "path", d: ringsToPathData(shifted) }, name: "Outline", init: { x: bb.minX, y: bb.minY } });
    },

    combineSelection: (op) => {
      const sel = new Set(get().selection);
      // Document order is z-order; the bottom-most shape is the subject for difference.
      const ordered = get().doc.objects.filter((o) => sel.has(o.id) && o.geo.kind !== "image");
      if (ordered.length < 2) {
        get().notify("info", "Select two or more shapes to combine.");
        return;
      }
      const ringsOf = (o: DesignObject): Ring[] => worldPolylines(o).map((pl) => pl.points);
      let result: Ring[];
      if (op === "union") {
        result = booleanRings(ordered.flatMap(ringsOf), [], "union");
      } else if (op === "difference") {
        result = booleanRings(ringsOf(ordered[0]), ordered.slice(1).flatMap(ringsOf), "difference");
      } else {
        result = ordered
          .map(ringsOf)
          .reduce<Ring[] | null>((acc, r) => (acc === null ? r : booleanRings(acc, r, op)), null) ?? [];
      }
      const bb = ringsBBox(result);
      if (result.length === 0 || !bb) {
        get().notify("info", "Combining those shapes left nothing.");
        return;
      }
      const shifted = result.map((r) => r.map((p) => ({ x: p.x - bb.minX, y: p.y - bb.minY })));
      const keep = ordered[0];
      const id = newId();
      const removeIds = new Set(ordered.map((o) => o.id));
      get().commitDoc((doc) => {
        const objects = doc.objects.filter((o) => !removeIds.has(o.id));
        objects.push({
          id,
          name: "Combined",
          layerId: keep.layerId,
          ...DEFAULT_TRANSFORM,
          x: bb.minX,
          y: bb.minY,
          geo: { kind: "path", d: ringsToPathData(shifted) },
          style: keep.style,
        });
        return { ...doc, objects };
      });
      set({ selection: [id] });
    },

    contourSelection: () => {
      const sel = new Set(get().selection);
      const targets = get().doc.objects.filter((o) => sel.has(o.id) && (o.geo.kind === "path" || o.geo.kind === "text"));
      if (targets.length === 0) {
        get().notify("info", "Select a path or text to remove its interior holes.");
        return;
      }
      let changed = false;
      get().commitDoc((d) => {
        const objects = d.objects.map((o) => {
          if (!sel.has(o.id) || (o.geo.kind !== "path" && o.geo.kind !== "text")) return o;
          // Split into sub-paths at each "M"; a sub-path whose flattened ring sits
          // inside a larger one is a hole — drop it, keeping the curve data of the rest.
          const groups: Seg[][] = [];
          for (const s of parsePath(o.geo.d)) {
            if (s.t === "M") groups.push([s]);
            else if (groups.length) groups[groups.length - 1].push(s);
          }
          if (groups.length <= 1) return o;
          const rings = groups.map((g) => flattenSegs(g).flatMap((pl) => pl.points));
          const keep = groups.filter(
            (_g, i) =>
              rings[i].length >= 3 &&
              !rings.some(
                (or, j) => j !== i && or.length >= 3 && Math.abs(ringArea(or)) > Math.abs(ringArea(rings[i])) && pointInRing(rings[i][0], or),
              ),
          );
          if (keep.length === groups.length) return o;
          changed = true;
          return { ...o, geo: { ...o.geo, d: keep.map((g) => serializePath(g, 3)).join(" ") } };
        });
        return changed ? { ...d, objects } : d;
      });
      if (!changed) get().notify("info", "No interior holes to remove.");
    },

    enterNodeEdit: (id) => {
      const o = get().doc.objects.find((x) => x.id === id);
      if (o && o.geo.kind === "path") set({ nodeEditId: id, selection: [id], activeNode: null });
    },

    exitNodeEdit: () => set((s) => (s.nodeEditId || s.activeNode !== null ? { nodeEditId: null, activeNode: null } : s)),

    setActiveNode: (seg) => set((s) => (s.activeNode === seg ? s : { activeNode: seg })),

    insertNodeWorld: (wx, wy) => {
      const id = get().nodeEditId;
      if (!id || !Number.isFinite(wx) || !Number.isFinite(wy)) return;
      const o = get().doc.objects.find((x) => x.id === id);
      if (!o || o.geo.kind !== "path") return;
      const inv = invertMatrix(matrixOf(o));
      if (!inv) return;
      const local = transformPoint(inv, wx, wy);
      const segs = parsePath(o.geo.d);
      const hit = nearestOnPath(segs, local);
      if (!hit) return;
      const next = insertNode(segs, hit.seg, hit.t);
      get().mapObjects([id], (obj) => (obj.geo.kind === "path" ? { ...obj, geo: { ...obj.geo, d: serializePath(next, 3) } } : obj));
      set({ activeNode: null });
    },

    deleteActiveNode: () => {
      const id = get().nodeEditId;
      const seg = get().activeNode;
      if (!id || seg == null) return;
      const o = get().doc.objects.find((x) => x.id === id);
      if (!o || o.geo.kind !== "path") return;
      const segs = parsePath(o.geo.d);
      const next = deleteNode(segs, seg);
      if (serializePath(next) === serializePath(segs)) {
        get().notify("info", "Can't delete that node — a path needs at least two points.");
        return;
      }
      get().mapObjects([id], (obj) => (obj.geo.kind === "path" ? { ...obj, geo: { ...obj.geo, d: serializePath(next, 3) } } : obj));
      set({ activeNode: null });
    },

    moveHandleWorld: (segIndex, which, wx, wy) => {
      const id = get().nodeEditId;
      if (!id || !Number.isFinite(wx) || !Number.isFinite(wy)) return;
      const o = get().doc.objects.find((x) => x.id === id);
      if (!o || o.geo.kind !== "path") return;
      const inv = invertMatrix(matrixOf(o));
      if (!inv) return;
      const local = transformPoint(inv, wx, wy);
      const segs = parsePath(o.geo.d);
      const seg = segs[which === "in" ? segIndex : segIndex + 1];
      if (!seg) return;
      let cur: { x: number; y: number } | null = null;
      if (which === "in") cur = seg.t === "C" ? { x: seg.x2, y: seg.y2 } : seg.t === "Q" ? { x: seg.x1, y: seg.y1 } : null;
      else cur = seg.t === "C" || seg.t === "Q" ? { x: seg.x1, y: seg.y1 } : null;
      if (!cur) return;
      const next = moveHandle(segs, segIndex, which, local.x - cur.x, local.y - cur.y);
      get().mapObjects([id], (obj) => (obj.geo.kind === "path" ? { ...obj, geo: { ...obj.geo, d: serializePath(next, 3) } } : obj), "handle");
    },

    moveNodeWorld: (segIndex, wx, wy) => {
      const id = get().nodeEditId;
      if (!id || !Number.isFinite(wx) || !Number.isFinite(wy)) return;
      const o = get().doc.objects.find((x) => x.id === id);
      if (!o || o.geo.kind !== "path") return;
      const inv = invertMatrix(matrixOf(o));
      if (!inv) return;
      const local = transformPoint(inv, wx, wy);
      const segs = parsePath(o.geo.d);
      const anchor = segs[segIndex];
      if (!anchor || anchor.t === "Z") return;
      const dx = local.x - anchor.x;
      const dy = local.y - anchor.y;
      const moved = moveAnchor(segs, segIndex, dx, dy);
      get().mapObjects([id], (obj) => (obj.geo.kind === "path" ? { ...obj, geo: { ...obj.geo, d: serializePath(moved, 3) } } : obj), "node");
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

    setObjectLocked: (ids, locked) => get().mapObjects(ids, (o) => ({ ...o, locked: locked || undefined })),

    setObjectHidden: (ids, hidden) => {
      get().mapObjects(ids, (o) => ({ ...o, hidden: hidden || undefined }));
      if (hidden) {
        const dropped = new Set(ids);
        set((s) => ({ selection: s.selection.filter((id) => !dropped.has(id)) }));
      }
    },

    showAllObjects: () =>
      get().commitDoc((d) =>
        d.objects.some((o) => o.hidden) ? { ...d, objects: d.objects.map((o) => (o.hidden ? { ...o, hidden: undefined } : o)) } : d,
      ),

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

    setStyle: (ids, patch) =>
      get().mapObjects(
        ids,
        (o) => {
          const style = { ...o.style, ...patch };
          // Drop keys set back to undefined so a cleared fill falls back to the layer.
          for (const k of Object.keys(style) as (keyof ObjectStyle)[]) {
            if (style[k] === undefined) delete style[k];
          }
          return { ...o, style };
        },
        "style",
      ),

    group: () => {
      const ids = new Set(get().selection);
      if (ids.size < 2) return;
      const gid = newId();
      get().mapObjects(get().selection, (o) => ({ ...o, groupId: gid }));
    },

    ungroup: () => {
      const sel = new Set(get().selection);
      const groups = new Set(
        get().doc.objects.filter((o) => sel.has(o.id) && o.groupId).map((o) => o.groupId as string),
      );
      if (groups.size === 0) return;
      get().commitDoc((d) => ({
        ...d,
        objects: d.objects.map((o) => (o.groupId && groups.has(o.groupId) ? { ...o, groupId: undefined } : o)),
      }));
    },

    setTextProps: async (id, patch) => {
      const current = get().doc.objects.find((o) => o.id === id);
      if (!current || current.geo.kind !== "text") return;
      const next = { ...current.geo, ...patch };
      try {
        const font = await loadFont(next.fontId);
        const outline = textOutline(font, next.text, next.size, next.letterSpacing);
        // Curve the outline along an arc when requested, recomputing the bounds.
        const arc = next.arc ?? 0;
        let bits = { d: outline.d, width: outline.width, height: outline.height };
        if (arc) {
          const d = arcWarpPath(outline.d, outline.width, arc);
          const bb = segsBBox(parsePath(d));
          bits = bb ? { d, width: bb.maxX - bb.minX, height: bb.maxY - bb.minY } : bits;
        }
        get().mapObjects(
          [id],
          (o) => {
            if (o.geo.kind !== "text") return o;
            const before = worldAABB(o);
            const updated: DesignObject = {
              ...o,
              name: patch.text !== undefined ? nameFor(get().doc, { ...next, ...bits }) : o.name,
              geo: { ...next, ...bits, arc },
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
        const valid = expandGroups(s.doc, existingIds(s.doc, ids));
        return { selection: additive ? Array.from(new Set([...s.selection, ...valid])) : valid };
      }),

    toggleSelect: (id) =>
      set((s) => {
        const groupIds = expandGroups(s.doc, [id]);
        const already = s.selection.includes(id);
        const current = new Set(s.selection);
        for (const g of groupIds) {
          if (already) current.delete(g);
          else current.add(g);
        }
        return { selection: [...current] };
      }),

    selectAll: () =>
      set((s) => {
        const open = new Set(s.doc.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
        return { selection: s.doc.objects.filter((o) => open.has(o.layerId) && !o.hidden && !o.locked).map((o) => o.id) };
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

    setTemplatesOpen: (templatesOpen) => set({ templatesOpen }),

    setHelpOpen: (helpOpen) => set({ helpOpen }),

    setGeneratorOpen: (generatorOpen) => set({ generatorOpen }),

    setSaveStatus: (saveStatus) => set((s) => (s.saveStatus === saveStatus ? s : { saveStatus })),

    setPanelsOpen: (panelsOpen) => set({ panelsOpen }),

    setMode: (mode) => set({ mode }),

    setShowRulers: (showRulers) => set({ showRulers }),

    setSnapToGrid: (snapToGrid) => set({ snapToGrid }),

    addGuide: (axis, mm) => {
      if (!Number.isFinite(mm)) return; // ignore junk positions
      const v = Math.round(mm * 10) / 10;
      set((s) => {
        const key = axis === "x" ? "guidesX" : "guidesY";
        const list = s[key];
        if (list.length >= 64 || list.some((g) => Math.abs(g - v) < 0.05)) return s; // cap + dedupe
        return { [key]: [...list, v].sort((a, b) => a - b) } as Partial<EditorState>;
      });
    },

    clearGuides: () => set((s) => (s.guidesX.length || s.guidesY.length ? { guidesX: [], guidesY: [] } : s)),

    openContextMenu: (x, y) => set({ contextMenu: { x, y } }),

    closeContextMenu: () => set((s) => (s.contextMenu ? { contextMenu: null } : s)),
  };
});

/** Convenience for components that only need the selected objects. */
export function selectedObjectsOf(state: Pick<EditorState, "doc" | "selection">): DesignObject[] {
  const ids = new Set(state.selection);
  return state.doc.objects.filter((o) => ids.has(o.id));
}
