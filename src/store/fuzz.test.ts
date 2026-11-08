import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultDoc } from "@/lib/doc/defaults";
import { useEditor } from "./editorStore";

/**
 * Adversarial fuzz: run a long, chaotic sequence of store operations — including
 * deliberately hostile inputs (NaN/Infinity coordinates, junk SVG, collapsing
 * offsets, operations on empty/incompatible selections) — and assert the
 * document invariants hold after every step. This is the "break it" routine:
 * any uncaught throw or corrupted state fails the test with the offending step.
 */

const st = () => useEditor.getState();

// Deterministic PRNG so a failure is reproducible.
let seed = 0x2545f491;
const rnd = () => {
  seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const coord = () => rnd() * 320 - 60; // frequently off the mat
const hostile = () => pick([NaN, Infinity, -Infinity, 1e400, coord(), coord()]);

const rect = () => ({ kind: "rect" as const, width: 5 + rnd() * 40, height: 5 + rnd() * 40, cornerRadius: 0 });
const ell = () => ({ kind: "ellipse" as const, rx: 2 + rnd() * 20, ry: 2 + rnd() * 20 });
const path = () => ({ kind: "path" as const, d: "M0 0C0 20 20 20 20 0L10 10Z" });
const text = () => ({ kind: "text" as const, text: "Hi", fontId: "lilita" as const, size: 20, letterSpacing: 0, d: "M0 0L10 0L10 12Z", width: 10, height: 12 });

function checkInvariants(step: string) {
  const s = st();
  const ids = new Set(s.doc.objects.map((o) => o.id));
  const layerIds = new Set(s.doc.layers.map((l) => l.id));
  for (const o of s.doc.objects) {
    const fin = [o.x, o.y, o.rotation, o.scaleX, o.scaleY].every(Number.isFinite);
    expect(fin, `${step}: object ${o.id} has a non-finite transform`).toBe(true);
    expect(layerIds.has(o.layerId), `${step}: object ${o.id} points at a missing layer`).toBe(true);
    if (o.geo.kind === "path" || o.geo.kind === "text") {
      expect(/NaN|Infinity/.test(o.geo.d), `${step}: object ${o.id} has NaN/Infinity in its path`).toBe(false);
    }
    if (o.geo.kind === "rect") expect(o.geo.width > 0 && o.geo.height > 0, `${step}: rect has non-positive size`).toBe(true);
  }
  for (const id of s.selection) expect(ids.has(id), `${step}: selection references a missing object`).toBe(true);
  expect(s.pages[s.activePage] === s.doc, `${step}: active page is out of sync with doc`).toBe(true);
  if (s.nodeEditId) {
    const o = s.doc.objects.find((x) => x.id === s.nodeEditId);
    expect(!o || o.geo.kind === "path", `${step}: node-edit target is not a path`).toBe(true);
  }
  expect(s.pages.length >= 1 && s.activePage >= 0 && s.activePage < s.pages.length, `${step}: page index out of range`).toBe(true);
}

describe("store fuzz (break it)", () => {
  beforeEach(() => {
    useEditor.setState({ clipboard: null });
    st().loadDoc(createDefaultDoc());
  });

  it.each([0x2545f491, 0x12345678])("survives chaotic operations (seed %i) with invariants intact", (s0) => {
    seed = s0 & 0x7fffffff;
    const ops: Array<[string, () => void]> = [
      ["add rect", () => st().addObject({ geo: rect(), init: { x: coord(), y: coord() } })],
      ["add ellipse", () => st().addObject({ geo: ell(), init: { x: coord(), y: coord() } })],
      ["add path", () => st().addObject({ geo: path(), init: { x: coord(), y: coord() } })],
      ["add text", () => st().addObject({ geo: text(), init: { x: coord(), y: coord() } })],
      ["select random", () => st().select(st().doc.objects.filter(() => rnd() < 0.5).map((o) => o.id))],
      ["select all", () => st().selectAll()],
      ["clear selection", () => st().clearSelection()],
      ["group", () => st().group()],
      ["ungroup", () => st().ungroup()],
      ["align", () => st().align(pick(["left", "right", "hcenter", "top", "bottom", "vmiddle"]))],
      ["distribute", () => st().distribute(pick(["h", "v"]))],
      ["auto-nest", () => st().autoNest()],
      ["boolean", () => st().combineSelection(pick(["union", "difference", "intersection", "xor"]))],
      ["outline (hostile dist)", () => st().outlineSelection(pick([3, 0, -99, 1e9, hostile()]))],
      ["contour", () => st().contourSelection()],
      ["duplicate", () => st().duplicateObjects(st().selection)],
      ["remove", () => st().removeObjects(st().selection)],
      ["copy", () => st().copy()],
      ["cut", () => st().cut()],
      ["paste", () => st().paste()],
      ["nudge", () => st().nudge(coord() / 10, coord() / 10)],
      ["rotate", () => st().setRotation(rnd() * 720 - 360)],
      ["flip", () => st().flip(pick(["x", "y"]))],
      ["set style", () => st().setStyle(st().selection, { fill: pick(["#FF8FA3", "#000000", undefined]), opacity: rnd() })],
      ["add page", () => st().addPage()],
      ["select page", () => st().selectPage(Math.floor(rnd() * (st().pages.length + 1)))],
      ["duplicate page", () => st().duplicatePage(st().activePage)],
      ["delete page", () => st().deletePage(Math.floor(rnd() * st().pages.length))],
      ["undo", () => st().undo()],
      ["redo", () => st().redo()],
      ["enter node edit", () => { const pth = st().doc.objects.find((o) => o.geo.kind === "path"); if (pth) st().enterNodeEdit(pth.id); }],
      ["exit node edit", () => st().exitNodeEdit()],
      ["insert node (hostile)", () => st().insertNodeWorld(hostile(), hostile())],
      ["move node (hostile)", () => st().moveNodeWorld(Math.floor(rnd() * 5), hostile(), coord())],
      ["set active node", () => st().setActiveNode(Math.floor(rnd() * 6))],
      ["delete active node", () => st().deleteActiveNode()],
      ["move handle (hostile)", () => st().moveHandleWorld(1, pick(["in", "out"]), hostile(), coord())],
      ["import junk svg", () => st().importSvgText(pick(['<svg viewBox="0 0 9 9"><path d="M NaN 0"/></svg>', "<svg></svg>", "garbage", '<svg viewBox="0 0 10 10"><rect width="1e400" height="5"/><circle cx="5" cy="5" r="3"/></svg>']), "Junk")],
      ["set mat", () => st().setMat({ preset: "custom", width: 50 + rnd() * 400, height: 50 + rnd() * 400 })],
    ];

    for (let i = 0; i < 200; i++) {
      const [name, fn] = pick(ops);
      try {
        fn();
      } catch (e) {
        throw new Error(`Step ${i} "${name}" threw: ${(e as Error).message}`);
      }
      checkInvariants(`step ${i} after "${name}"`);
    }
  }, 30000);
});
