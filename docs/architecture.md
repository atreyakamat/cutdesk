# Architecture

How CutDesk is put together, from the document model up to the canvas.

## Principles

- **One source of truth.** A single Zustand store (`src/store/editorStore.ts`) holds the document, selection, view, and transient UI state. Components read from it and call its actions; they never hold design state of their own.
- **A pure, UI-free document model.** Everything in `src/lib/doc` is plain TypeScript in millimetres with no React or Konva imports, so it is fully unit-testable. Geometry, path math, boolean/offset ops, cut planning, and exporters all live here.
- **Additive, backward-compatible changes.** New capabilities attach as optional fields (e.g. object `style`, `groupId`, text `arc`) and new store actions, so existing documents keep loading.

## The document model

```ts
Doc { name, unit, mat, layers: Layer[], objects: DesignObject[] }
DesignObject { id, name, layerId, x, y, rotation, scaleX, scaleY, geo, style?, groupId? }
Geometry = rect | ellipse | path | text | image
```

- **Transforms** apply as translate → rotate → scale (the Konva/SVG convention). `geometry.ts` builds the matrix, computes world-space bounds and polylines, and holds the pure object operations (translate, resize, flip, matrix inverse…).
- **Paths** are parsed/serialised by `pathData.ts` (`Seg[]` of M/L/C/Q/Z) which also does flattening, bounds, node anchors, insert/delete/handle edits, and nearest-point queries.
- **A project** wraps one or more pages: `{ format: "cutdesk", version: 2, pages: Doc[], activePage }`. `project.ts` validates with Zod and still reads the v1 single-`doc` shape.

## The store

`editorStore.ts` is the hub. Notable areas:

- **History** — `commitDoc(fn, { coalesce })` pushes undo snapshots (coalescing rapid edits like slider drags). `pages` keeps `pages[activePage]` in sync with the live `doc`; each page carries its own undo stack (`pageHist`).
- **Objects** — add/remove/duplicate, transforms, align/distribute, **boolean** (`combineSelection`), **offset** (`outlineSelection`), **contour** (`contourSelection`), **auto-nest** (`autoNest`), grouping, per-object style, text (incl. curved), and **node editing** (`enterNodeEdit`, `insertNodeWorld`, `deleteActiveNode`, `moveHandleWorld`).
- **Clipboard** — an in-store clipboard that survives page switches, so copy/paste works across pages while preserving the image/reference-layer invariants.
- **View & chrome** — pan/zoom, rulers + guides, context menu, notices, dialog flags, autosave status.

## Rendering

- `components/canvas/MatCanvas.tsx` owns the Konva `Stage`. It renders objects (`ObjectNode`), the selection `Transformer`, drafts, snapping/alignment/spacing guides, user guides, and the node-editing handles.
- **Interaction** lives here too: pointer gestures (marquee, shape draft, pen), object drag with live snapping, transform-with-snapping (`boundBoxFunc`), and node editing. Canvas event handlers are plain functions (not `useCallback`) so the React Compiler's immutability rule stays happy with the render-scoped pointer helper.
- The store's `view` (scale px/mm, translate) maps millimetres to the stage; `Rulers.tsx` and the backdrop use the same mapping.

## Geometry subsystems

| Concern | Module | Notes |
| --- | --- | --- |
| Boolean / offset | `lib/doc/clip.ts` | Wraps `clipper-lib`; scales mm → integer space; drops non-finite rings |
| Contour / holes | `lib/doc/clip.ts` | `removeHoles` via area + point-in-ring containment |
| Nodes | `lib/doc/pathData.ts` | insert (de Casteljau split), delete, handle move, nearest-on-path |
| Curved text | `lib/doc/arcWarp.ts` | Bends a path along an arc; re-applied whenever text changes |
| Snapping | `lib/doc/snapping.ts` | Edge/centre targets + equal-spacing distribution |
| Nesting | `lib/doc/nest.ts` | Shelf first-fit-decreasing packing |
| Cut planning | `lib/doc/cutPlan.ts` | Orders passes draw → score → cut |

## Output

- **SVG** (`svg.ts`) bakes transforms into paths, colours by operation; `registration.ts` adds print-then-cut marks.
- **Raster/PDF** (`raster.ts`, `pdf.ts`) render a *visual* SVG (fills + opacity) to a canvas for PNG, and embed that as a JPEG in a hand-built single-page PDF — no heavy dependency.
- **G-code** (`machine/gcode.ts`) turns the cut plan into GRBL moves; the `machine/` transports stream it to the simulator, Web Serial, the bridge, or Tauri's native serial.

## Testing

Pure modules are unit-tested directly (Vitest). Store logic is tested against the real store. Each feature ships with adversarial tests that feed it hostile/degenerate input (non-finite coordinates, corrupt storage, collapsing offsets, oversized inputs) to prove it fails safe. Playwright (`e2e/`) drives the built app for the DOM-observable flows.
