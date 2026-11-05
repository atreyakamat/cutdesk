"use client";

import { ImagePlus, Sparkles, Type } from "lucide-react";
import { createSampleDoc } from "@/lib/sample";
import { useEditor } from "@/store/editorStore";
import { Button } from "./ui/Controls";

/** Shown on an empty mat. It points at the three quickest ways to get something to cut. */
export function EmptyState() {
  const empty = useEditor((s) => s.doc.objects.length === 0);
  const tool = useEditor((s) => s.tool);
  const preview = useEditor((s) => s.preview);
  const viewport = useEditor((s) => s.viewport);
  const openImport = useEditor((s) => s.openImport);

  if (!empty || preview || tool !== "select" || viewport.width === 0) return null;

  const loadSample = async () => {
    const st = useEditor.getState();
    try {
      st.loadDoc(await createSampleDoc());
    } catch (err) {
      st.notify("error", err instanceof Error ? err.message : "Couldn't load the sample.");
    }
  };

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
      <div className="pointer-events-auto max-w-sm rounded-pop bg-panel/95 p-5 shadow-pop backdrop-blur">
        <h2 className="font-display text-xl font-semibold leading-tight tracking-tight">Nothing on the mat yet</h2>
        <p className="mt-1.5 text-sm text-ink-soft">
          Pick a shape tool from the left and drag on the mat, or start with one of these.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void useEditor.getState().createText(viewport.width ? useEditor.getState().doc.mat.width / 2 : 0, useEditor.getState().doc.mat.height / 2)}>
            <Type className="size-3.5" aria-hidden="true" />
            Add text
          </Button>
          <Button onClick={() => openImport()}>
            <ImagePlus className="size-3.5" aria-hidden="true" />
            Trace an image
          </Button>
          <Button variant="ghost" onClick={() => void loadSample()}>
            <Sparkles className="size-3.5" aria-hidden="true" />
            Load a sample
          </Button>
        </div>
        <p className="mt-3 text-xs text-ink-faint">You can also drop an image straight onto the mat.</p>
      </div>
    </div>
  );
}
