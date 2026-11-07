"use client";

import { useEffect, useRef } from "react";
import { clampMenuPosition, contextMenuItems, type CtxItem } from "@/lib/ui/contextMenu";
import { useEditor } from "@/store/editorStore";
import { cn } from "./ui/cn";

const EST_WIDTH = 220;
const ROW = 34;

export function CanvasContextMenu() {
  const menu = useEditor((s) => s.contextMenu);
  const close = useEditor((s) => s.closeContextMenu);
  const selection = useEditor((s) => s.selection);
  const clipboard = useEditor((s) => s.clipboard);
  const doc = useEditor((s) => s.doc);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    // Capture so a click anywhere (including the canvas) dismisses first.
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [menu, close]);

  if (!menu) return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const grouped = doc.objects.some((o) => selection.includes(o.id) && !!o.groupId);
  const items = contextMenuItems({
    hasSelection: selection.length > 0,
    multi: selection.length >= 2,
    canPaste: !!clipboard && clipboard.length > 0,
    grouped,
  });
  const pos = clampMenuPosition(menu.x, menu.y, EST_WIDTH, items.length * ROW + 12, vw, vh);

  const run = (id: string) => {
    const st = useEditor.getState();
    const sel = st.selection;
    switch (id) {
      case "copy": st.copy(); break;
      case "cut": st.cut(); break;
      case "paste": st.paste(); break;
      case "duplicate": st.duplicateObjects(sel); break;
      case "selectAll": st.selectAll(); break;
      case "group": st.group(); break;
      case "ungroup": st.ungroup(); break;
      case "front": st.restack("front"); break;
      case "back": st.restack("back"); break;
      case "delete": st.removeObjects(sel); break;
    }
    close();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Canvas actions"
      className="pop-in fixed z-50 min-w-52 rounded-pop bg-panel p-1.5 text-sm shadow-pop outline-none"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it: CtxItem) => (
        <div key={it.id}>
          {it.separatorBefore && <div className="my-1 h-px bg-line" role="separator" />}
          <button
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => run(it.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-control px-2.5 py-1.5 text-left outline-none disabled:opacity-40",
              it.disabled ? "cursor-default" : "hover:bg-ink hover:text-on-ink",
              it.danger && !it.disabled ? "text-blade hover:bg-blade hover:text-on-ink" : "",
            )}
          >
            <span className="flex-1">{it.label}</span>
            {it.shortcut && <span className="text-xs opacity-60">{it.shortcut}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}
