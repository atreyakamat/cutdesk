"use client";

import { exportFileName, exportPrintable, exportSvg, slugify, type ExportKind } from "@/lib/doc/svg";
import { buildPreviewHtml, exportVisualSvg, rasterSize } from "@/lib/doc/raster";
import { jpegToPdf, mmToPt } from "@/lib/doc/pdf";
import { PROJECT_EXTENSION, ProjectError, parseProject, serializeProject } from "@/lib/doc/project";
import { importUserTemplates, listUserTemplates, serializeTemplatesBundle } from "@/lib/doc/templates";
import { useEditor } from "@/store/editorStore";

export function downloadFile(name: string, content: string | Blob, mime: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Open the system file picker. Resolves to null when the person cancels. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function exportSvgFile(kind: ExportKind): void {
  const { doc, notify } = useEditor.getState();
  const operations = kind === "all" ? undefined : ([kind] as const);
  const svg = exportSvg(doc, { operations });
  const hasGeometry = svg.includes("<path") || svg.includes("<image");
  if (!hasGeometry) {
    notify("info", kind === "all" ? "There's nothing to export yet." : `No visible ${kind} layers have anything on them.`);
    return;
  }
  downloadFile(exportFileName(doc, kind), svg, "image/svg+xml");
  notify("info", `Exported ${exportFileName(doc, kind)}.`);
}

export function exportPrintableFile(): void {
  const { doc, notify } = useEditor.getState();
  const svg = exportPrintable(doc);
  if (!svg.includes("<path") && !svg.includes("<image")) {
    notify("info", "There's nothing to print yet.");
    return;
  }
  downloadFile(`${slugify(doc.name)}-print.svg`, svg, "image/svg+xml");
  notify("info", "Exported the print-then-cut layout with registration marks.");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't render the design image."));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed while encoding the image."))), type, quality);
  });
}

/** Rasterise the current design to a canvas at print resolution. */
async function renderDesignCanvas(background?: string): Promise<HTMLCanvasElement> {
  const { doc } = useEditor.getState();
  const { width, height } = rasterSize(doc);
  const svg = exportVisualSvg(doc, { background });
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't render a canvas for export.");
    if (background && background !== "transparent") {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPngFile(): Promise<void> {
  const st = useEditor.getState();
  try {
    const canvas = await renderDesignCanvas(); // transparent background
    const blob = await canvasToBlob(canvas, "image/png");
    downloadFile(`${slugify(st.doc.name)}.png`, blob, "image/png");
    st.notify("info", `Exported ${slugify(st.doc.name)}.png.`);
  } catch (err) {
    st.notify("error", err instanceof Error ? err.message : "Couldn't export a PNG.");
  }
}

export async function exportPdfFile(): Promise<void> {
  const st = useEditor.getState();
  const { doc } = st;
  try {
    const { width, height } = rasterSize(doc);
    const canvas = await renderDesignCanvas("#ffffff");
    const jpeg = new Uint8Array(await (await canvasToBlob(canvas, "image/jpeg", 0.92)).arrayBuffer());
    const pdf = jpegToPdf(jpeg, width, height, mmToPt(doc.mat.width), mmToPt(doc.mat.height));
    downloadFile(`${slugify(doc.name)}.pdf`, new Blob([pdf as BlobPart], { type: "application/pdf" }), "application/pdf");
    st.notify("info", `Exported ${slugify(doc.name)}.pdf.`);
  } catch (err) {
    st.notify("error", err instanceof Error ? err.message : "Couldn't export a PDF.");
  }
}

export function exportPreviewFile(): void {
  const { doc, notify } = useEditor.getState();
  const svg = exportVisualSvg(doc, { background: "#ffffff" });
  if (!svg.includes("<path") && !svg.includes("<image")) {
    notify("info", "Nothing to preview yet.");
    return;
  }
  downloadFile(`${slugify(doc.name)}-preview.html`, buildPreviewHtml(doc.name, svg), "text/html");
  notify("info", "Exported a shareable preview — open it or send the file to anyone.");
}

/** Download every saved template as a self-contained bundle (local backup/share). */
export function exportTemplatesFile(): void {
  const { notify } = useEditor.getState();
  const templates = listUserTemplates();
  if (templates.length === 0) {
    notify("info", "You don't have any saved templates to export yet.");
    return;
  }
  downloadFile("cutdesk-templates.json", serializeTemplatesBundle(templates), "application/json");
  notify("info", `Exported ${templates.length} template${templates.length === 1 ? "" : "s"}.`);
}

/** Pick a bundle file and import its templates. Resolves to how many were added. */
export async function importTemplatesFile(file?: File | null): Promise<number> {
  const { notify } = useEditor.getState();
  const picked = file ?? (await pickFile(".json,application/json"));
  if (!picked) return 0;
  try {
    const added = importUserTemplates(await picked.text());
    notify(added > 0 ? "info" : "error", added > 0 ? `Imported ${added} template${added === 1 ? "" : "s"}.` : "No templates were imported.");
    return added;
  } catch (err) {
    notify("error", err instanceof Error ? err.message : "Couldn't import that template file.");
    return 0;
  }
}

export function saveProjectFile(): void {
  const { doc, pages, activePage, notify } = useEditor.getState();
  downloadFile(`${slugify(doc.name)}${PROJECT_EXTENSION}`, serializeProject({ pages, activePage }), "application/json");
  const pageNote = pages.length > 1 ? ` (${pages.length} pages)` : "";
  notify("info", `Saved ${slugify(doc.name)}${PROJECT_EXTENSION}${pageNote}.`);
}

export async function openSvgFile(file?: File | null): Promise<void> {
  const st = useEditor.getState();
  const picked = file ?? (await pickFile(".svg,image/svg+xml"));
  if (!picked) return;
  try {
    st.importSvgText(await picked.text(), picked.name.replace(/\.[^.]+$/, "") || "SVG");
  } catch {
    st.notify("error", "Couldn't read that SVG file.");
  }
}

export async function openProjectFile(file?: File | null): Promise<void> {
  const st = useEditor.getState();
  const picked = file ?? (await pickFile(`${PROJECT_EXTENSION},.json,application/json`));
  if (!picked) return;
  try {
    const project = parseProject(await picked.text());
    st.loadProject(project);
    const active = project.pages[project.activePage] ?? project.pages[0];
    const pageNote = project.pages.length > 1 ? ` · ${project.pages.length} pages` : "";
    st.notify("info", `Opened ${active.name}${pageNote}.`);
  } catch (err) {
    st.notify("error", err instanceof ProjectError ? err.message : "Couldn't open that file.");
  }
}
