<div align="center">

# ✂️ CutDesk

**A browser-based design studio for cutting machines.**
Draw, trace, and lay out cut-ready artwork — then export SVG/PNG/PDF/G-code or send it straight to a machine.

Runs on the web, as a native desktop app (Windows · macOS · Linux), and in Docker.
Built with Next.js 16 · React 19 · TypeScript · Konva · Zustand.

</div>

---

CutDesk is a personal design-and-cut app in the spirit of Cricut Design Space — a vector editor with real cut planning — reimagined to run anywhere and to double as a lightweight design tool. It is **not** a clone of, nor compatible with, any commercial product; it talks to open-firmware cutters and to printable/exportable formats.

> All geometry is stored in **millimetres**. The document model in `src/lib/doc` has no UI dependencies and is covered by unit tests.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | End-to-end tests (Playwright) |
| `npm run lint` | ESLint |
| `npm run desktop` | Tauri desktop app (dev) |

Needs **Node 22+**. Works in any current Chromium or Firefox; machine features (Web Serial) need a Chromium browser over HTTPS or localhost.

---

## Features

### ✏️ Editor & canvas
- **Tools:** select, rectangle, ellipse, **pen** (click for corners, drag for curves, Enter to finish, click the first point to close), text, pan.
- **Smart snapping & alignment guides** — objects snap to each other's edges/centres and to the mat, with pink guide lines, **equal-spacing (distribution) guides**, and snapping while resizing. Hold **Alt/⌘** to move freely.
- **Rulers & guides** — toggleable rulers; click a ruler to drop a guide, double-click to clear. Guides snap like any alignment line.
- **Multi-page projects** — each page has its own mat, layers, objects, and undo history.
- **Dark mode** — full light/dark theming that follows the system or a manual toggle; the mat stays green on a dark bench.
- **Quality of life** — copy/cut/paste across pages (`Ctrl C/X/V`), right-click context menu, an autosave **Saved** indicator, and a keyboard-shortcut sheet (press `?`).

### 🎨 Design
- **Per-object fill & opacity**, independent of cut semantics, with colour swatches, a native **eyedropper**, and saveable **style presets**.
- **Text** becomes real outlines so it can be cut. Four bundled OFL fonts (Lilita One, Pacifico, Bricolage Grotesque, Hanken Grotesk).
- **Curved text** — bend text along an arc, and keep it editable.

### 🔺 Vector operations
- **Boolean ops** — union, subtract, intersect, exclude (via the battle-tested `clipper-lib`).
- **Offset / outline** — one click wraps any shape in a uniform border (the sticker *kiss-cut* line), at an adjustable distance.
- **Contour** — remove interior holes to solidify a shape (e.g. fill the inside of an "O").
- **Node editing** — double-click a path to edit it: drag anchors, **add** a node (double-click the path) or **delete** one (`Delete`), and drag **bezier handles**.
- **Auto-nest** — "Arrange to fit" packs the selection tightly on the mat to save material.

### 🖼️ Content & gallery
- A **shape gallery**, generated **numbers & letters**, **emoji**, and **image upload** (stored locally in the browser).
- **Image → sticker** — trace artwork into a silhouette with an adjustable border, keeping the original as reference art.
- **Templates** — built-in starters (greeting card, round labels, sticker sheet, gift tags) plus "save this page as a template."
- **Remote catalog** — point the gallery at a hosted JSON manifest to load a whole asset library (see [`docs/gallery-catalog.md`](docs/gallery-catalog.md)); build one from a folder with `scripts/build-catalog.mjs`.

### ⚙️ Cutting & output
- **Layers** with an operation each — **cut**, **score**, **draw**, or **reference** (never cut). Reorder by dragging.
- **Preview cut** animates the path in machine order: draw → score → cut.
- **Print-then-cut** — exports a printable sheet with registration marks that line up with the cut file.
- **Export** — SVG (all or per-operation), **PNG**, **PDF**, and **G-code** (GRBL).
- **Send to a machine** — a pluggable transport layer: a built-in simulator, **USB (Web Serial)**, a **WebSocket bridge** (for Bluetooth-as-serial / background use), and native serial in the desktop app.

### 💾 Projects & mats
- Projects save as **`.cutdesk.json`** (v2 format; still opens older single-page files) and autosave in the browser.
- **Mats:** 12 × 12 in, 12 × 24 in, A4, A3, or a custom size, in mm or inches. Anything past the mat edge is flagged.

---

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `V` `R` `E` `P` `T` `H` | Select · Rectangle · Ellipse · Pen · Text · Pan |
| `I` | Trace an image |
| `Ctrl Z` / `Ctrl Shift Z` | Undo / Redo |
| `Ctrl C` / `Ctrl X` / `Ctrl V` | Copy / Cut / Paste (works across pages) |
| `Ctrl D` · `Ctrl A` · `Ctrl S` | Duplicate · Select all · Save project |
| `Ctrl G` / `Ctrl Shift G` | Group / Ungroup |
| `Delete` | Remove selection (or the selected node while editing) |
| Arrows | Nudge 1 mm (`Shift`: 10 mm) |
| `+` `−` `Ctrl 0` | Zoom in · out · fit |
| `?` | Keyboard shortcut help |
| `Esc` | Cancel, deselect, or exit node editing |

Mouse wheel pans; `Ctrl`/`⌘` + wheel zooms; Space or middle-drag pans. **Double-click a path** to edit its nodes; **Alt-drag** to move without snapping.

---

## Platforms

| Target | How |
| --- | --- |
| **Web** | `npm run dev` / deploy the static or Node build |
| **Desktop** (Win/macOS/Linux) | `npm run desktop` — a [Tauri](https://tauri.app) app with native serial (`src-tauri/`) |
| **Docker** | `docker compose up --build` → http://localhost:8304 |

### Driving a real machine
Stock Cricut machines use a proprietary, server-locked protocol and can't be driven from a browser. CutDesk's supported paths are:
- **Open-firmware cutters** (e.g. a Cricut running **CutcutGo**/GRBL) over **Web Serial** (wired) or the **bridge server** (`bridge/`, which also covers paired-Bluetooth-as-serial).
- **SVG / G-code export** as the universal fallback — open it in Inkcut, the cutter's own software, etc.

### House of Stix
CutDesk integrates with the [House of Stix](docs/houseofstix.md) control room: it serves a static `public/health.json`, maps Docker to host port **8304**, and ships a `services.yaml` entry to paste into that repo.

---

## Project layout

```
src/
  app/            Next.js app router, global styles, theme init
  components/     Editor UI — TopBar, ToolRail, Inspector, dialogs, PageBar, Rulers…
    canvas/       Konva canvas: MatCanvas, ObjectNode, previews
  lib/
    doc/          Document model (mm): geometry, path data, boolean/offset (clip),
                  node ops, cut planning, SVG/PDF/raster export, snapping, nesting…
    gallery/      Shape catalog, glyphs, emoji, uploads, remote catalog
    machine/      G-code + transports (Web Serial, bridge, simulator, Tauri)
    text/ trace/ ui/
  store/          Zustand editor store (single source of truth)
  types/
e2e/              Playwright end-to-end tests
bridge/           Standalone Node WebSocket↔serial bridge
src-tauri/        Tauri desktop shell (Rust)
scripts/          Catalog manifest builder
docs/             Integration & catalog docs
```

See [`docs/architecture.md`](docs/architecture.md) for how the pieces fit together.

## Testing & CI

- **Unit** — Vitest, covering the pure document model, geometry, boolean/offset, nodes, nesting, store logic, and more.
- **End-to-end** — Playwright drives the built app in a real browser.
- **CI** — GitHub Actions (`.github/workflows/ci.yml`) runs lint → types → unit → build and the E2E suite on every push and PR.

```bash
npm test          # unit
npm run e2e       # end-to-end (installs its own Chromium in CI)
```

## Tech stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Konva / react-konva · Zustand · Zod · opentype.js · imagetracerjs · clipper-lib · Radix UI · Framer Motion · Tauri v2.

---

<div align="center">
<sub>A personal project. Not affiliated with, nor compatible with, any commercial cutting-machine software.</sub>
</div>
