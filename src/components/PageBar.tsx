"use client";

import { Copy, Plus, Trash2 } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { IconButton } from "./ui/IconButton";
import { cn } from "./ui/cn";

/**
 * The project's pages, each its own mat. Click a chip to switch; the name is
 * the active page's title (edited in the top bar). Hidden during a cut preview
 * so it doesn't collide with the preview readout.
 */
export function PageBar() {
  const pages = useEditor((s) => s.pages);
  const activePage = useEditor((s) => s.activePage);
  const preview = useEditor((s) => s.preview);
  const selectPage = useEditor((s) => s.selectPage);
  const addPage = useEditor((s) => s.addPage);
  const duplicatePage = useEditor((s) => s.duplicatePage);
  const deletePage = useEditor((s) => s.deletePage);

  if (preview) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-16">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-pop bg-panel/90 p-1 shadow-pop backdrop-blur">
        <div className="scroll-thin flex items-center gap-1 overflow-x-auto">
          {pages.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => selectPage(i)}
              aria-current={i === activePage}
              title={p.name || `Page ${i + 1}`}
              className={cn(
                "h-7 max-w-[10rem] shrink-0 truncate rounded-control px-2.5 text-xs transition-colors",
                i === activePage ? "bg-ink text-on-ink" : "text-ink hover:bg-sunken",
              )}
            >
              {p.name || `Page ${i + 1}`}
            </button>
          ))}
        </div>
        <div className="mx-0.5 h-5 w-px shrink-0 bg-line" role="separator" />
        <IconButton icon={Plus} label="Add page" size="sm" tipSide="top" onClick={addPage} />
        <IconButton icon={Copy} label="Duplicate page" size="sm" tipSide="top" onClick={() => duplicatePage(activePage)} />
        <IconButton
          icon={Trash2}
          label="Delete page"
          size="sm"
          tipSide="top"
          disabled={pages.length <= 1}
          onClick={() => deletePage(activePage)}
        />
      </div>
    </div>
  );
}
