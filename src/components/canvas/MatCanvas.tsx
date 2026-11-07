"use client";

import type Konva from "konva";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Ellipse, Layer, Path, Rect, Stage, Transformer } from "react-konva";
import { buildCutPlan } from "@/lib/doc/cutPlan";
import { bboxesIntersect, matrixOf, unionBBox, worldAABB } from "@/lib/doc/geometry";
import { computeSnap, distributionSnap, snapBoxes, snapTargets, type SnapLines, type SpacingGuide } from "@/lib/doc/snapping";
import { clamp, formatLength } from "@/lib/doc/units";
import { normalizeSegs, parsePath, pathAnchors, serializePath, transformPoint } from "@/lib/doc/pathData";
import { canFinishPen, dropDuplicateTail, penSegs, type PenNode } from "@/lib/doc/pen";
import type { BBox, Point } from "@/lib/doc/types";
import { useEditor } from "@/store/editorStore";
import { Button } from "../ui/Controls";
import { CutPreviewLayer } from "./CutPreview";
import { MatBackdrop } from "./MatBackdrop";
import { ObjectNode } from "./ObjectNode";

type Gesture =
  | { kind: "pan"; sx: number; sy: number; tx: number; ty: number }
  | { kind: "marquee"; a: Point; additive: boolean }
  | { kind: "shape"; shape: "rect" | "ellipse"; a: Point }
  | { kind: "pen-handle" };

type Draft =
  | { kind: "marquee"; a: Point; b: Point }
  | { kind: "rect" | "ellipse"; a: Point; b: Point; square: boolean };

interface DragState {
  leader: string;
  origin: Point;
  nodes: Map<string, { node: Konva.Node; x: number; y: number }>;
  /** Union bounds of the selection at drag start, in mm. */
  startBox: BBox;
  /** Snap lines collected from the mat and the other objects, in mm. */
  lines: SnapLines;
  /** Bounds of the other objects, for equal-spacing checks. */
  boxes: BBox[];
}

const INK = "#17251e";
const SELECT_BLUE = "#2455d6";
const GUIDE_PINK = "#e5327b";
const GUIDE_LINE = "#17b3c4";
/** How close (screen px) a box line must come to a target before it snaps. */
const SNAP_PX = 6;

function readTransform(node: Konva.Node) {
  return { x: node.x(), y: node.y(), rotation: node.rotation(), scaleX: node.scaleX(), scaleY: node.scaleY() };
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** Rectangle spanned by two corners; `square` forces equal sides, growing away from `a`. */
function spanned(a: Point, b: Point, square: boolean) {
  let w = Math.abs(b.x - a.x);
  let h = Math.abs(b.y - a.y);
  if (square) w = h = Math.max(w, h);
  const x = b.x < a.x ? a.x - w : a.x;
  const y = b.y < a.y ? a.y - h : a.y;
  return { x, y, width: w, height: h };
}

export function MatCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);

  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const view = useEditor((s) => s.view);
  const viewport = useEditor((s) => s.viewport);
  const preview = useEditor((s) => s.preview);
  const guidesX = useEditor((s) => s.guidesX);
  const guidesY = useEditor((s) => s.guidesY);
  const nodeEditId = useEditor((s) => s.nodeEditId);
  const activeNode = useEditor((s) => s.activeNode);
  const setViewport = useEditor((s) => s.setViewport);

  const nodeEditObj = useMemo(
    () => (nodeEditId ? doc.objects.find((o) => o.id === nodeEditId) ?? null : null),
    [nodeEditId, doc.objects],
  );
  const nodeAnchors = useMemo(() => {
    if (!nodeEditObj || nodeEditObj.geo.kind !== "path") return [];
    const m = matrixOf(nodeEditObj);
    return pathAnchors(parsePath(nodeEditObj.geo.d)).map((a) => ({ seg: a.seg, ...transformPoint(m, a.x, a.y) }));
  }, [nodeEditObj]);
  // Bezier handles for the selected node (its in/out control points), in world mm.
  const nodeHandles = useMemo(() => {
    if (!nodeEditObj || nodeEditObj.geo.kind !== "path" || activeNode == null) return [];
    const m = matrixOf(nodeEditObj);
    const segs = parsePath(nodeEditObj.geo.d);
    const seg = segs[activeNode];
    if (!seg || seg.t === "Z") return [];
    const anchor = transformPoint(m, seg.x, seg.y);
    const out: { which: "in" | "out"; anchor: Point; x: number; y: number }[] = [];
    const inLocal = seg.t === "C" ? { x: seg.x2, y: seg.y2 } : seg.t === "Q" ? { x: seg.x1, y: seg.y1 } : null;
    if (inLocal) out.push({ which: "in", anchor, ...transformPoint(m, inLocal.x, inLocal.y) });
    const nseg = segs[activeNode + 1];
    const outLocal = nseg && (nseg.t === "C" || nseg.t === "Q") ? { x: nseg.x1, y: nseg.y1 } : null;
    if (outLocal) out.push({ which: "out", anchor, ...transformPoint(m, outLocal.x, outLocal.y) });
    return out;
  }, [nodeEditObj, activeNode]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [spacing, setSpacing] = useState<SpacingGuide[]>([]);
  const [pen, setPen] = useState<{ nodes: PenNode[]; hover: Point | null }>({ nodes: [], hover: null });
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [doneRun, setDoneRun] = useState<number | null>(null);
  const previewDone = preview !== null && doneRun === preview.runId;
  const setPreviewDone = (done: boolean) => setDoneRun(done && preview ? preview.runId : null);

  const gesture = useRef<Gesture | null>(null);
  const lastPoint = useRef<Point>({ x: 0, y: 0 });
  const dragState = useRef<DragState | null>(null);
  const resizeLines = useRef<SnapLines | null>(null);
  const penRef = useRef(pen);
  useEffect(() => {
    penRef.current = pen;
  });

  const layerById = useMemo(() => new Map(doc.layers.map((l) => [l.id, l] as const)), [doc.layers]);
  const objectById = useMemo(() => new Map(doc.objects.map((o) => [o.id, o] as const)), [doc.objects]);
  const ordered = useMemo(
    () => doc.layers.flatMap((l) => (l.visible ? doc.objects.filter((o) => o.layerId === l.id) : [])),
    [doc.layers, doc.objects],
  );

  // ------------------------------------------------------------------ sizing

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setViewport(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [setViewport]);

  // Wheel pans; Ctrl/⌘ + wheel (and trackpad pinch) zooms about the pointer.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = useEditor.getState();
      const rect = el.getBoundingClientRect();
      const k = e.deltaMode === 1 ? 16 : 1;
      if (e.ctrlKey || e.metaKey) {
        const dy = clamp(e.deltaY * k, -60, 60);
        st.zoomAt(Math.exp(-dy * 0.004), e.clientX - rect.left, e.clientY - rect.top);
      } else {
        const swap = e.shiftKey && e.deltaX === 0;
        const dx = (swap ? e.deltaY : e.deltaX) * k;
        const dy = (swap ? 0 : e.deltaY) * k;
        st.setView({ ...st.view, tx: st.view.tx - dx, ty: st.view.ty - dy });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // --------------------------------------------------------------- keyboard

  const cancelPen = useCallback(() => setPen({ nodes: [], hover: null }), []);

  const finishPen = useCallback(
    (closed: boolean) => {
      const st = useEditor.getState();
      const nodes = closed ? penRef.current.nodes : dropDuplicateTail(penRef.current.nodes);
      if (!canFinishPen(nodes, closed)) {
        cancelPen();
        return;
      }
      const n = normalizeSegs(penSegs(nodes, closed));
      if (n.width < 0.2 && n.height < 0.2) {
        cancelPen();
        return;
      }
      st.addObject({ geo: { kind: "path", d: n.d }, init: { x: n.dx, y: n.dy } });
      cancelPen();
      st.setTool("select");
    },
    [cancelPen],
  );

  const onDblClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const st = useEditor.getState();
    if (st.tool === "pen") {
      finishPen(false);
      return;
    }
    if (st.tool !== "select") return;
    // While editing a path, a double-click on it inserts a node at that point.
    if (st.nodeEditId && e.target.name() === "obj" && e.target.id() === st.nodeEditId) {
      const p = pointer();
      if (p) st.insertNodeWorld(p.x, p.y);
      return;
    }
    // Otherwise double-clicking a path enters node editing.
    if (e.target.name() === "obj") {
      const o = st.doc.objects.find((x) => x.id === e.target.id());
      if (o?.geo.kind === "path") st.enterNodeEdit(e.target.id());
    }
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpaceHeld(true);
      }
      if (useEditor.getState().tool === "pen") {
        if (e.key === "Enter") {
          e.preventDefault();
          finishPen(false);
        } else if (e.key === "Escape") {
          cancelPen();
        } else if (e.key === "Backspace" && penRef.current.nodes.length > 0) {
          e.preventDefault();
          setPen((p) => ({ ...p, nodes: p.nodes.slice(0, -1) }));
        }
      }
      const st0 = useEditor.getState();
      if ((e.key === "Delete" || e.key === "Backspace") && st0.nodeEditId && st0.activeNode != null) {
        e.preventDefault();
        st0.deleteActiveNode();
        return;
      }
      if (e.key === "Escape") {
        if (useEditor.getState().nodeEditId) useEditor.getState().exitNodeEdit();
        gesture.current = null;
        setDraft(null);
        setPanning(false);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [cancelPen, finishPen]);

  // Leaving the pen tool abandons a half-drawn path.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets local pen state when the tool changes
    if (tool !== "pen") cancelPen();
  }, [tool, cancelPen]);

  // ------------------------------------------------------------ transformer

  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const want = new Set(preview || tool !== "select" || nodeEditId ? [] : selection);
    const nodes = stage.find<Konva.Node>(".obj").filter((n) => want.has(n.id()));
    tr.nodes(nodes);
    tr.forceUpdate();
    tr.getLayer()?.batchDraw();
  }, [selection, tool, preview, nodeEditId, doc.objects, doc.layers, view.scale]);

  // Leaving the select tool exits node editing.
  useEffect(() => {
    if (tool !== "select") useEditor.getState().exitNodeEdit();
  }, [tool]);

  // ----------------------------------------------------------------- cursor

  useEffect(() => {
    const container = stageRef.current?.container();
    if (!container) return;
    const handTool = tool === "hand" || spaceHeld;
    container.style.cursor = panning ? "grabbing" : handTool ? "grab" : tool === "text" ? "text" : tool === "select" ? "default" : "crosshair";
  }, [tool, panning, spaceHeld]);

  // ---------------------------------------------------------------- gestures

  const pointer = (): Point | null => {
    const p = stageRef.current?.getRelativePointerPosition();
    return p ? { x: p.x, y: p.y } : null;
  };

  const onDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const st = useEditor.getState();
    if (st.preview) return;
    const stage = e.target.getStage();
    const p = pointer();
    if (!stage || !p) return;
    lastPoint.current = p;

    const evt = e.evt;
    const button = "button" in evt ? evt.button : 0;
    const shift = "shiftKey" in evt ? evt.shiftKey : false;

    if (st.tool === "hand" || spaceHeld || button === 1) {
      const sp = stage.getPointerPosition();
      if (!sp) return;
      gesture.current = { kind: "pan", sx: sp.x, sy: sp.y, tx: st.view.tx, ty: st.view.ty };
      setPanning(true);
      evt.preventDefault();
      return;
    }
    if (button !== 0) return;
    if (e.target.getParent()?.className === "Transformer") return;

    if (st.nodeEditId) {
      if (e.target.name() === "node") return; // let the handle drag
      st.exitNodeEdit(); // a click elsewhere leaves node editing, then proceeds
    }

    switch (st.tool) {
      case "select": {
        if (e.target.name() === "obj") {
          const id = e.target.id();
          if (shift) st.toggleSelect(id);
          else if (!st.selection.includes(id)) st.select([id]);
          return;
        }
        if (!shift) st.clearSelection();
        gesture.current = { kind: "marquee", a: p, additive: shift };
        setDraft({ kind: "marquee", a: p, b: p });
        return;
      }
      case "rect":
      case "ellipse":
        gesture.current = { kind: "shape", shape: st.tool, a: p };
        setDraft({ kind: st.tool, a: p, b: p, square: shift });
        return;
      case "text":
        void st.createText(p.x, p.y);
        return;
      case "pen": {
        const { nodes } = penRef.current;
        const near = 9 / st.view.scale;
        if (nodes.length >= 3 && Math.hypot(p.x - nodes[0].x, p.y - nodes[0].y) <= near) {
          finishPen(true);
          return;
        }
        setPen({ nodes: [...nodes, { x: p.x, y: p.y, ox: 0, oy: 0 }], hover: p });
        gesture.current = { kind: "pen-handle" };
        return;
      }
    }
  };

  const onMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const st = useEditor.getState();
    const stage = e.target.getStage();
    const p = pointer();
    if (!stage || !p) return;
    lastPoint.current = p;
    st.setCursor(p);

    const g = gesture.current;
    const shift = "shiftKey" in e.evt ? e.evt.shiftKey : false;
    if (g?.kind === "pan") {
      const sp = stage.getPointerPosition();
      if (sp) st.setView({ scale: st.view.scale, tx: g.tx + sp.x - g.sx, ty: g.ty + sp.y - g.sy });
    } else if (g?.kind === "marquee") {
      setDraft({ kind: "marquee", a: g.a, b: p });
    } else if (g?.kind === "shape") {
      setDraft({ kind: g.shape, a: g.a, b: p, square: shift });
    } else if (g?.kind === "pen-handle") {
      setPen((prev) => {
        const nodes = prev.nodes.slice();
        const last = nodes[nodes.length - 1];
        if (!last) return prev;
        const far = Math.hypot(p.x - last.x, p.y - last.y) > 3 / st.view.scale;
        nodes[nodes.length - 1] = far ? { ...last, ox: p.x - last.x, oy: p.y - last.y } : { ...last, ox: 0, oy: 0 };
        return { nodes, hover: p };
      });
    } else if (st.tool === "pen") {
      setPen((prev) => ({ ...prev, hover: p }));
    }
  };

  const finishGesture = useCallback((shift: boolean) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    setPanning(false);
    const st = useEditor.getState();
    const p = pointer() ?? lastPoint.current;

    if (g.kind === "marquee") {
      setDraft(null);
      const box = spanned(g.a, p, false);
      if (box.width < 1 && box.height < 1) return;
      const frame = { minX: box.x, minY: box.y, maxX: box.x + box.width, maxY: box.y + box.height };
      const open = new Set(st.doc.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
      const hits = st.doc.objects.filter((o) => open.has(o.layerId) && bboxesIntersect(worldAABB(o), frame)).map((o) => o.id);
      st.select(hits, g.additive || shift);
    } else if (g.kind === "shape") {
      setDraft(null);
      let { x, y, width, height } = spanned(g.a, p, shift);
      if (width < 1.5 && height < 1.5) {
        // A plain click drops a default-sized shape centred on the pointer.
        width = height = 40;
        x = g.a.x - 20;
        y = g.a.y - 20;
      }
      if (g.shape === "rect") {
        st.addObject({ geo: { kind: "rect", width, height, cornerRadius: 0 }, init: { x, y } });
      } else {
        st.addObject({
          geo: { kind: "ellipse", rx: Math.max(0.5, width / 2), ry: Math.max(0.5, height / 2) },
          init: { x: x + width / 2, y: y + height / 2 },
        });
      }
      st.setTool("select");
    }
  }, []);

  // Releasing the button outside the stage must still end the gesture.
  useEffect(() => {
    const up = (e: MouseEvent | TouchEvent) => finishGesture("shiftKey" in e ? e.shiftKey : false);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchend", up);
    };
  }, [finishGesture]);

  // ------------------------------------------------------------ drag objects

  const onDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const st = useEditor.getState();
    const lead = e.target;
    const stage = lead.getStage();
    if (!stage) return;
    const ids = st.selection.includes(lead.id()) ? st.selection : [lead.id()];
    const wanted = new Set(ids);
    const nodes = new Map<string, { node: Konva.Node; x: number; y: number }>();
    for (const n of stage.find<Konva.Node>(".obj")) {
      if (wanted.has(n.id())) nodes.set(n.id(), { node: n, x: n.x(), y: n.y() });
    }
    const dragged = st.doc.objects.filter((o) => wanted.has(o.id)).map(worldAABB);
    const startBox = unionBBox(dragged) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const lines = snapTargets(st.doc, wanted);
    lines.xs.push(...st.guidesX); // snap to user guides too
    lines.ys.push(...st.guidesY);
    dragState.current = {
      leader: lead.id(),
      origin: { x: lead.x(), y: lead.y() },
      nodes,
      startBox,
      lines,
      boxes: snapBoxes(st.doc, wanted),
    };
  }, []);

  const onDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const d = dragState.current;
    if (!d) return;
    const rawDx = e.target.x() - d.origin.x;
    const rawDy = e.target.y() - d.origin.y;
    let dx = rawDx;
    let dy = rawDy;

    // Hold Alt (or ⌘) to drag freely without snapping.
    const evt = e.evt as DragEvent & { altKey?: boolean; metaKey?: boolean };
    const bypass = !!(evt && (evt.altKey || evt.metaKey));
    let gx: number | null = null;
    let gy: number | null = null;
    let spaces: SpacingGuide[] = [];
    if (!bypass) {
      const tol = SNAP_PX / useEditor.getState().view.scale;
      const shift = (box: BBox, ox: number, oy: number): BBox => ({
        minX: box.minX + ox,
        minY: box.minY + oy,
        maxX: box.maxX + ox,
        maxY: box.maxY + oy,
      });
      // 1) Edge/centre snap to the mat and other objects.
      const snap = computeSnap(shift(d.startBox, dx, dy), d.lines, tol);
      dx += snap.dx;
      dy += snap.dy;
      gx = snap.guideX;
      gy = snap.guideY;
      // 2) Equal-spacing snap, but only on an axis that didn't already edge-snap.
      const dist = distributionSnap(shift(d.startBox, dx, dy), d.boxes, tol);
      if (gx === null && dist.dx !== 0) dx += dist.dx;
      if (gy === null && dist.dy !== 0) dy += dist.dy;
      spaces = dist.guides.filter((g) => (g.axis === "x" ? gx === null : gy === null));
      if (dx !== rawDx || dy !== rawDy) e.target.position({ x: d.origin.x + dx, y: d.origin.y + dy });
    }

    for (const [id, item] of d.nodes) {
      if (id !== d.leader) item.node.position({ x: item.x + dx, y: item.y + dy });
    }
    setGuides((prev) => (prev.x === gx && prev.y === gy ? prev : { x: gx, y: gy }));
    setSpacing((prev) => (prev.length === 0 && spaces.length === 0 ? prev : spaces));
  }, []);

  const onDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const d = dragState.current;
    dragState.current = null;
    setGuides((prev) => (prev.x === null && prev.y === null ? prev : { x: null, y: null }));
    setSpacing((prev) => (prev.length === 0 ? prev : []));
    if (!d || e.target.id() !== d.leader) return;
    const updates = [...d.nodes].map(([id, item]) => ({ id, ...readTransform(item.node) }));
    useEditor.getState().setTransforms(updates);
  }, []);

  const onTransformStart = () => {
    const st = useEditor.getState();
    const lines = snapTargets(st.doc, new Set(st.selection));
    lines.xs.push(...st.guidesX);
    lines.ys.push(...st.guidesY);
    resizeLines.current = lines;
  };

  const onTransformEnd = () => {
    resizeLines.current = null;
    setGuides((prev) => (prev.x === null && prev.y === null ? prev : { x: null, y: null }));
    const tr = trRef.current;
    if (!tr) return;
    const nodes = tr.nodes();
    const updates = nodes.map((n) => ({ id: n.id(), ...readTransform(n) }));
    // Rectangles and ellipses fold scale into their size, so clear it on the node
    // to stop the new size from being applied twice.
    for (const n of nodes) {
      const kind = objectById.get(n.id())?.geo.kind;
      if (kind === "rect" || kind === "ellipse") n.scale({ x: Math.sign(n.scaleX()) || 1, y: Math.sign(n.scaleY()) || 1 });
    }
    useEditor.getState().setTransforms(updates);
  };

  /**
   * Snap the resize box's moving edge onto the nearest alignment line. The
   * Transformer works in absolute (screen) pixels, so targets are mapped from
   * millimetres through the current view. Only axis-aligned (unrotated) boxes
   * snap; rotated ones resize freely.
   */
  const snapResizeBox = (oldBox: Konva.IRect & { rotation: number }, newBox: Konva.IRect & { rotation: number }) => {
    if (Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4) return oldBox;
    const lines = resizeLines.current;
    if (!lines || Math.abs(newBox.rotation) > 1e-3) return newBox;
    const v = useEditor.getState().view;
    const tolPx = SNAP_PX;
    const near = (absPos: number, mmTargets: number[], toAbs: (mm: number) => number) => {
      let best: { delta: number; mm: number } | null = null;
      let bestDist = tolPx;
      for (const mm of mmTargets) {
        const d = toAbs(mm) - absPos;
        if (Math.abs(d) <= bestDist) {
          bestDist = Math.abs(d);
          best = { delta: d, mm };
        }
      }
      return best;
    };
    const toAbsX = (mm: number) => v.tx + mm * v.scale;
    const toAbsY = (mm: number) => v.ty + mm * v.scale;
    let gx: number | null = null;
    let gy: number | null = null;

    if (Math.abs(newBox.x - oldBox.x) > 1e-6) {
      const s = near(newBox.x, lines.xs, toAbsX);
      if (s) { newBox.x += s.delta; newBox.width -= s.delta; gx = s.mm; }
    } else if (Math.abs(newBox.x + newBox.width - (oldBox.x + oldBox.width)) > 1e-6) {
      const s = near(newBox.x + newBox.width, lines.xs, toAbsX);
      if (s) { newBox.width += s.delta; gx = s.mm; }
    }
    if (Math.abs(newBox.y - oldBox.y) > 1e-6) {
      const s = near(newBox.y, lines.ys, toAbsY);
      if (s) { newBox.y += s.delta; newBox.height -= s.delta; gy = s.mm; }
    } else if (Math.abs(newBox.y + newBox.height - (oldBox.y + oldBox.height)) > 1e-6) {
      const s = near(newBox.y + newBox.height, lines.ys, toAbsY);
      if (s) { newBox.height += s.delta; gy = s.mm; }
    }
    setGuides((prev) => (prev.x === gx && prev.y === gy ? prev : { x: gx, y: gy }));
    return newBox;
  };

  // ---------------------------------------------------------------- previews


  const planStats = useMemo(() => (preview ? buildCutPlan(doc) : null), [preview, doc]);

  const draftShape = (() => {
    if (!draft) return null;
    if (draft.kind === "marquee") {
      const b = spanned(draft.a, draft.b, false);
      return <Rect {...b} fill="rgba(36, 85, 214, 0.08)" stroke={SELECT_BLUE} strokeWidth={1} strokeScaleEnabled={false} listening={false} />;
    }
    const b = spanned(draft.a, draft.b, draft.square);
    const common = { fill: "rgba(255, 255, 255, 0.4)", stroke: INK, strokeWidth: 1.2, strokeScaleEnabled: false, dash: [5, 4], listening: false };
    return draft.kind === "rect" ? (
      <Rect {...common} {...b} />
    ) : (
      <Ellipse {...common} x={b.x + b.width / 2} y={b.y + b.height / 2} radiusX={b.width / 2} radiusY={b.height / 2} />
    );
  })();

  const userGuides = (() => {
    if (guidesX.length === 0 && guidesY.length === 0) return null;
    const m = 40;
    return (
      <>
        {guidesX.map((gx, i) => (
          <Path key={`gx${i}`} data={`M${gx} ${-m}L${gx} ${doc.mat.height + m}`} stroke={GUIDE_LINE} strokeWidth={0.8} strokeScaleEnabled={false} dash={[4, 3]} listening={false} />
        ))}
        {guidesY.map((gy, i) => (
          <Path key={`gy${i}`} data={`M${-m} ${gy}L${doc.mat.width + m} ${gy}`} stroke={GUIDE_LINE} strokeWidth={0.8} strokeScaleEnabled={false} dash={[4, 3]} listening={false} />
        ))}
      </>
    );
  })();

  const guideShapes = (() => {
    if (guides.x === null && guides.y === null) return null;
    const m = 40; // extend a little past the mat so the line clearly spans it
    const x0 = -m;
    const x1 = doc.mat.width + m;
    const y0 = -m;
    const y1 = doc.mat.height + m;
    return (
      <>
        {guides.x !== null && (
          <Path data={`M${guides.x} ${y0}L${guides.x} ${y1}`} stroke={GUIDE_PINK} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
        )}
        {guides.y !== null && (
          <Path data={`M${x0} ${guides.y}L${x1} ${guides.y}`} stroke={GUIDE_PINK} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
        )}
      </>
    );
  })();

  const spacingShapes = (() => {
    if (spacing.length === 0) return null;
    const cap = 3 / view.scale; // half-length of the end ticks, in mm
    return spacing.flatMap((g, gi) =>
      g.spans.map((s, si) => {
        const key = `${gi}-${si}`;
        if (g.axis === "x") {
          return (
            <Path
              key={key}
              data={`M${s.start} ${s.at - cap}L${s.start} ${s.at + cap}M${s.start} ${s.at}L${s.end} ${s.at}M${s.end} ${s.at - cap}L${s.end} ${s.at + cap}`}
              stroke={GUIDE_PINK}
              strokeWidth={1}
              strokeScaleEnabled={false}
              listening={false}
            />
          );
        }
        return (
          <Path
            key={key}
            data={`M${s.at - cap} ${s.start}L${s.at + cap} ${s.start}M${s.at} ${s.start}L${s.at} ${s.end}M${s.at - cap} ${s.end}L${s.at + cap} ${s.end}`}
            stroke={GUIDE_PINK}
            strokeWidth={1}
            strokeScaleEnabled={false}
            listening={false}
          />
        );
      }),
    );
  })();

  const penPreview = (() => {
    if (tool !== "pen" || pen.nodes.length === 0) return null;
    // eslint-disable-next-line react-hooks/refs -- only hides the rubber band; pointer moves re-render anyway
    const handleDrag = gesture.current?.kind === "pen-handle";
    const rubber: PenNode[] =
      pen.hover && !handleDrag ? [...pen.nodes, { x: pen.hover.x, y: pen.hover.y, ox: 0, oy: 0 }] : pen.nodes;
    const d = serializePath(penSegs(rubber, false), 4);
    const r = 4 / view.scale;
    const first = pen.nodes[0];
    const closing =
      pen.nodes.length >= 3 && !!pen.hover && Math.hypot(pen.hover.x - first.x, pen.hover.y - first.y) <= 9 / view.scale;
    const last = pen.nodes[pen.nodes.length - 1];
    return (
      <>
        <Path data={d} stroke={INK} strokeWidth={1.4} strokeScaleEnabled={false} dash={[5, 4]} listening={false} />
        {pen.nodes.map((n, i) => (
          <Rect
            key={i}
            x={n.x - r}
            y={n.y - r}
            width={r * 2}
            height={r * 2}
            fill={i === 0 && closing ? "#c7211f" : "#ffffff"}
            stroke={INK}
            strokeWidth={1.2}
            strokeScaleEnabled={false}
            listening={false}
          />
        ))}
        {(last.ox !== 0 || last.oy !== 0) && (
          <>
            <Path
              data={`M${last.x - last.ox} ${last.y - last.oy}L${last.x + last.ox} ${last.y + last.oy}`}
              stroke={SELECT_BLUE}
              strokeWidth={1}
              strokeScaleEnabled={false}
              listening={false}
            />
            <Circle x={last.x + last.ox} y={last.y + last.oy} radius={r * 0.8} fill={SELECT_BLUE} listening={false} />
            <Circle x={last.x - last.ox} y={last.y - last.oy} radius={r * 0.8} fill={SELECT_BLUE} listening={false} />
          </>
        )}
      </>
    );
  })();

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 touch-none overflow-hidden"
      onContextMenu={(e) => {
        e.preventDefault();
        const st = useEditor.getState();
        if (st.preview) return;
        const stage = stageRef.current;
        const pos = stage?.getPointerPosition();
        const hit = stage && pos ? stage.getIntersection(pos) : null;
        if (hit && hit.name() === "obj" && !st.selection.includes(hit.id())) st.select([hit.id()]);
        st.openContextMenu(e.clientX, e.clientY);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        const file = e.dataTransfer.files[0];
        if (!file) return;
        e.preventDefault();
        if (file.type.startsWith("image/")) useEditor.getState().openImport(file);
        else useEditor.getState().notify("error", "Drop a PNG, JPG, WebP or SVG image to trace it.");
      }}
    >
      <MatBackdrop />

      {viewport.width > 0 && (
        <Stage
          ref={stageRef}
          width={viewport.width}
          height={viewport.height}
          x={view.tx}
          y={view.ty}
          scaleX={view.scale}
          scaleY={view.scale}
          listening={!preview}
          onMouseDown={onDown}
          onTouchStart={onDown}
          onMouseMove={onMove}
          onTouchMove={onMove}
          onDblClick={onDblClick}
          onDblTap={onDblClick}
          aria-label="Cutting mat canvas"
        >
          <Layer opacity={preview ? 0.28 : 1}>
            {ordered.map((o) => {
              const layer = layerById.get(o.layerId);
              if (!layer) return null;
              return (
                <ObjectNode
                  key={o.id}
                  obj={o}
                  layer={layer}
                  draggable={tool === "select"}
                  onDragStart={onDragStart}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                />
              );
            })}
          </Layer>
          <Layer>
            {userGuides}
            {nodeEditObj && (
              <>
                {/* Bezier handles for the selected node */}
                {nodeHandles.map((h) => (
                  <Fragment key={h.which}>
                    <Path
                      data={`M${h.anchor.x} ${h.anchor.y}L${h.x} ${h.y}`}
                      stroke={SELECT_BLUE}
                      strokeWidth={1}
                      strokeScaleEnabled={false}
                      listening={false}
                    />
                    <Circle
                      name="node"
                      x={h.x}
                      y={h.y}
                      radius={4.5 / view.scale}
                      fill={SELECT_BLUE}
                      draggable
                      onDragMove={(e) => useEditor.getState().moveHandleWorld(activeNode!, h.which, e.target.x(), e.target.y())}
                      onDragEnd={(e) => useEditor.getState().moveHandleWorld(activeNode!, h.which, e.target.x(), e.target.y())}
                    />
                  </Fragment>
                ))}
                {/* Anchor points */}
                {nodeAnchors.map((a) => (
                  <Rect
                    key={a.seg}
                    name="node"
                    x={a.x - 5 / view.scale}
                    y={a.y - 5 / view.scale}
                    width={10 / view.scale}
                    height={10 / view.scale}
                    fill={a.seg === activeNode ? SELECT_BLUE : "#ffffff"}
                    stroke={SELECT_BLUE}
                    strokeWidth={1.4}
                    strokeScaleEnabled={false}
                    draggable
                    onMouseDown={() => useEditor.getState().setActiveNode(a.seg)}
                    onTouchStart={() => useEditor.getState().setActiveNode(a.seg)}
                    onDragMove={(e) => useEditor.getState().moveNodeWorld(a.seg, e.target.x() + 5 / view.scale, e.target.y() + 5 / view.scale)}
                    onDragEnd={(e) => useEditor.getState().moveNodeWorld(a.seg, e.target.x() + 5 / view.scale, e.target.y() + 5 / view.scale)}
                  />
                ))}
              </>
            )}
            {guideShapes}
            {spacingShapes}
            {draftShape}
            {penPreview}
            <Transformer
              ref={trRef}
              flipEnabled={false}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={4}
              rotateAnchorOffset={26}
              anchorSize={9}
              anchorCornerRadius={2}
              anchorStroke={INK}
              anchorFill="#ffffff"
              anchorStrokeWidth={1.4}
              borderStroke={INK}
              borderStrokeWidth={1.2}
              ignoreStroke
              boundBoxFunc={snapResizeBox}
              onTransformStart={onTransformStart}
              onTransformEnd={onTransformEnd}
            />
          </Layer>
          {preview && (
            <CutPreviewLayer runId={preview.runId} onFinished={() => setPreviewDone(true)} />
          )}
        </Stage>
      )}

      {preview && planStats && (
        <div
          role="status"
          className="pop-in absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-pop bg-ink px-4 py-2.5 text-sm text-on-ink shadow-pop"
        >
          {previewDone ? <Pause className="size-4 opacity-70" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
          <span>
            {previewDone ? "Cut order finished" : "Cutting"} · {formatLength(planStats.totalLength, doc.unit)} of path in{" "}
            {planStats.passes.length} {planStats.passes.length === 1 ? "pass" : "passes"}
          </span>
          <Button variant="ghost" className="h-7 px-2 text-on-ink hover:bg-on-ink/15" onClick={() => useEditor.getState().startPreview()}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Replay
          </Button>
          <Button variant="ghost" className="h-7 px-2 text-on-ink hover:bg-on-ink/15" onClick={() => useEditor.getState().stopPreview()}>
            <X className="size-3.5" aria-hidden="true" />
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
