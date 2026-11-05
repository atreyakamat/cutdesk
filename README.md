# CutDesk

A design app for cutting machines that runs in the browser. Draw shapes, set text, trace artwork into sticker outlines, assign layers to cut, score or draw, preview the cut order, and export SVG for your cutter's software.

It is a personal tool, not a clone of any commercial app.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests
npm run build      # production build
```

Needs Node 22+. Works in any current Chromium or Firefox on Linux.

## What it does

- **Tools:** select, rectangle, ellipse, pen (click for corners, drag for curves, Enter to finish, click the first point to close), text, pan.
- **Text** becomes real outlines so it can be cut. Fonts are bundled (Lilita One, Pacifico, Bricolage Grotesque, Hanken Grotesk, all OFL).
- **Trace an image** into a sticker outline with a border offset, or into shapes. Keep the artwork on a reference layer for alignment.
- **Layers** with an operation each: cut, score, draw, or reference (never cut). Reorder by dragging.
- **Preview cut** animates the path in machine order: draw, then score, then cut.
- **Export SVG** for everything or one operation. Transforms are baked in. Colours follow the usual convention: cut red, score blue, draw black.
- **Projects** save as `.cutdesk.json`. The design also autosaves in the browser.
- **Mats:** 12 × 12 in, 12 × 24 in, A4, A3 or a custom size, in mm or inches. Anything past the mat edge is flagged.

## Shortcuts

| Key | Action |
| --- | --- |
| V R E P T H | Select, rectangle, ellipse, pen, text, pan |
| I | Trace an image |
| Ctrl Z, Ctrl Shift Z | Undo, redo |
| Ctrl A, Ctrl D, Ctrl S | Select all, duplicate, save project |
| Delete | Remove selection |
| Arrows | Nudge 1 mm (Shift: 10 mm) |
| + − Ctrl 0 | Zoom in, out, fit |
| Esc | Cancel or deselect |

Mouse wheel pans. Ctrl or ⌘ plus wheel zooms. Space or middle-drag pans.

## Not done yet

- **Sending jobs to a machine.** Export SVG and open it in the cutter's own software, Inkscape or Inkcut. Cricut's protocol is proprietary, so a direct driver would be a separate project (Web Serial or WebUSB for open cutters).
- Node editing on paths, auto-nesting, snapping, cutting inner shapes before outer ones, dark mode.

## Stack

Next.js, React, TypeScript, Tailwind v4, Konva, zustand, zod, opentype.js, imagetracerjs, Radix primitives, Framer Motion (layer reordering). Document geometry is in millimetres and lives in `src/lib/doc`; it has no UI dependencies and is covered by tests.

Deploy target is Netlify (`netlify.toml`).
