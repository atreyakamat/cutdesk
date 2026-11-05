"use client";

import { exportFileName, exportSvg, slugify, type ExportKind } from "@/lib/doc/svg";
import { PROJECT_EXTENSION, ProjectError, parseProject, serializeProject } from "@/lib/doc/project";
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

export function saveProjectFile(): void {
  const { doc, notify } = useEditor.getState();
  downloadFile(`${slugify(doc.name)}${PROJECT_EXTENSION}`, serializeProject(doc), "application/json");
  notify("info", `Saved ${slugify(doc.name)}${PROJECT_EXTENSION}.`);
}

export async function openProjectFile(file?: File | null): Promise<void> {
  const st = useEditor.getState();
  const picked = file ?? (await pickFile(`${PROJECT_EXTENSION},.json,application/json`));
  if (!picked) return;
  try {
    const doc = parseProject(await picked.text());
    st.loadDoc(doc);
    st.notify("info", `Opened ${doc.name}.`);
  } catch (err) {
    st.notify("error", err instanceof ProjectError ? err.message : "Couldn't open that file.");
  }
}
