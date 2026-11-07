"use client";

import { useEffect } from "react";
import { saveProjectFile } from "@/lib/files";
import { useEditor, type Tool } from "@/store/editorStore";

export const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  r: "rect",
  e: "ellipse",
  p: "pen",
  t: "text",
  h: "hand",
};

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** Global keyboard shortcuts. Space-to-pan and the pen tool's keys live with the canvas. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "s") {
        e.preventDefault();
        saveProjectFile();
        return;
      }
      if (isTyping(e.target) || st.importOpen) return;

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        st.redo();
        return;
      }
      if (mod && key === "a") {
        e.preventDefault();
        st.selectAll();
        return;
      }
      if (mod && key === "d") {
        e.preventDefault();
        st.duplicateObjects(st.selection);
        return;
      }
      if (mod && key === "g") {
        e.preventDefault();
        if (e.shiftKey) st.ungroup();
        else st.group();
        return;
      }
      if (mod && key === "c") {
        e.preventDefault();
        st.copy();
        return;
      }
      if (mod && key === "x") {
        e.preventDefault();
        st.cut();
        return;
      }
      if (mod && key === "v") {
        e.preventDefault();
        st.paste();
        return;
      }
      if (mod && key === "0") {
        e.preventDefault();
        st.fitView();
        return;
      }
      if (mod) return;

      const centre = { x: st.viewport.width / 2, y: st.viewport.height / 2 };
      switch (e.key) {
        case "Escape":
          if (st.preview) st.stopPreview();
          else if (st.selection.length) st.clearSelection();
          else if (st.tool !== "select") st.setTool("select");
          return;
        case "Delete":
        case "Backspace":
          if (st.nodeEditId) return; // node deletion is handled on the canvas
          if (st.tool === "select" && st.selection.length) {
            e.preventDefault();
            st.removeObjects(st.selection);
          }
          return;
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          if (!st.selection.length || st.tool !== "select") return;
          e.preventDefault();
          const d = e.shiftKey ? 10 : 1;
          st.nudge(e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0, e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0);
          return;
        }
        case "+":
        case "=":
          st.zoomAt(1.25, centre.x, centre.y);
          return;
        case "-":
        case "_":
          st.zoomAt(0.8, centre.x, centre.y);
          return;
        case "!":
          st.fitView();
          return;
      }

      // "?" on some layouts reports key "/" with Shift held — accept both.
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        st.setHelpOpen(true);
        return;
      }
      if (key === "i" && !e.altKey) {
        st.openImport();
        return;
      }
      const tool = TOOL_KEYS[key];
      if (tool && !e.altKey) {
        st.setTool(tool);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
