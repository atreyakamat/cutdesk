"use client";

import { useEffect } from "react";
import { ProjectError, parseProject, serializeProject } from "@/lib/doc/project";
import { useEditor } from "@/store/editorStore";

const KEY = "cutdesk:autosave:v1";
const DELAY_MS = 600;

/**
 * Keeps the current design in this browser so a refresh doesn't lose work.
 * Storage can be unavailable (private windows) or full (large images), so
 * every access is guarded and the editor works without it.
 */
export function useAutosave(): void {
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved) useEditor.getState().loadDoc(parseProject(saved));
    } catch (err) {
      if (!(err instanceof ProjectError)) console.warn("CutDesk: could not read autosave", err);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let warned = false;

    const unsubscribe = useEditor.subscribe((state, prev) => {
      if (state.doc === prev.doc) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          window.localStorage.setItem(KEY, serializeProject(useEditor.getState().doc));
        } catch {
          if (!warned) {
            warned = true;
            useEditor
              .getState()
              .notify("error", "This design is too big to autosave in the browser. Use Save project so you don't lose it.");
          }
        }
      }, DELAY_MS);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);
}
