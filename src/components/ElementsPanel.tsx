"use client";

import { FileUp, LayoutTemplate, QrCode, Search, Shapes, Smile, Sparkles, Type, Upload } from "lucide-react";
import { importAnyFile } from "@/lib/files";
import { useEffect, useMemo, useState } from "react";
import { CATALOG, type GalleryShape } from "@/lib/gallery/catalog";
import { DND_MIME, serializeDragPayload } from "@/lib/gallery/dnd";
import { EMOJI, emojiToDataUrl, type EmojiItem } from "@/lib/gallery/emoji";
import { deleteUpload, listUploads, saveUpload, type Upload as GalleryUpload } from "@/lib/gallery/uploads";
import { useEditor } from "@/store/editorStore";
import { cn } from "./ui/cn";

type Section = "shapes" | "icons" | "text" | "emoji" | "uploads";

const SECTIONS: ReadonlyArray<{ id: Section; label: string; icon: typeof Shapes }> = [
  { id: "shapes", label: "Shapes", icon: Shapes },
  { id: "icons", label: "Icons", icon: Sparkles },
  { id: "text", label: "Text", icon: Type },
  { id: "emoji", label: "Emoji", icon: Smile },
  { id: "uploads", label: "Uploads", icon: Upload },
];

function centre(w: number, h: number) {
  const { doc } = useEditor.getState();
  return { x: doc.mat.width / 2 - w / 2, y: doc.mat.height / 2 - h / 2 };
}

function insertShape(s: GalleryShape) {
  useEditor.getState().addObject({ geo: { kind: "path", d: s.d }, name: s.name, init: centre(s.width, s.height) });
}
function insertEmoji(e: EmojiItem) {
  const src = emojiToDataUrl(e.char);
  if (!src) return;
  useEditor.getState().addObject({ geo: { kind: "image", src, width: 60, height: 60 }, name: e.name, init: centre(60, 60) });
}
function insertUpload(u: GalleryUpload) {
  const scale = 80 / Math.max(u.width, u.height);
  const w = u.width * scale;
  const h = u.height * scale;
  useEditor.getState().addObject({ geo: { kind: "image", src: u.dataUrl, width: w, height: h }, name: u.name, init: centre(w, h) });
}
async function addText(text: string, size: number) {
  const st = useEditor.getState();
  const id = await st.createText(st.doc.mat.width / 2, st.doc.mat.height / 2, text);
  if (id) await st.setTextProps(id, { size });
}

const TEXT_PRESETS: ReadonlyArray<{ label: string; size: number; className: string }> = [
  { label: "Add a heading", size: 36, className: "text-2xl font-bold" },
  { label: "Add a subheading", size: 24, className: "text-lg font-semibold" },
  { label: "Add body text", size: 14, className: "text-sm" },
];

function RailButton({ icon: Icon, label, active, onClick }: { icon: typeof Shapes; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex w-full flex-col items-center gap-1 rounded-control py-2 text-[10px] font-medium",
        active ? "bg-ink text-on-ink" : "text-ink-soft hover:bg-sunken hover:text-ink",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
      {label}
    </button>
  );
}

export function ElementsPanel() {
  const openTemplates = useEditor((s) => s.setTemplatesOpen);
  const openGenerator = useEditor((s) => s.setGeneratorOpen);
  const [section, setSection] = useState<Section | null>("shapes");
  const [query, setQuery] = useState("");
  const [uploads, setUploads] = useState<GalleryUpload[]>([]);

  const reloadUploads = async () => {
    try {
      setUploads(await listUploads());
    } catch {
      setUploads([]);
    }
  };
  useEffect(() => {
    if (section !== "uploads") return;
    let alive = true;
    listUploads().then(
      (u) => alive && setUploads(u),
      () => alive && setUploads([]),
    );
    return () => {
      alive = false;
    };
  }, [section]);

  useEffect(() => {
    // Start collapsed on small screens so the flyout doesn't cover the mat on load.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time responsive default on mount
    if (typeof window !== "undefined" && window.innerWidth < 1024) setSection(null);
  }, []);

  // Clicking the active section icon collapses the flyout (just the rail shows).
  const toggle = (id: Section) => setSection((cur) => (cur === id ? null : id));

  const q = query.trim().toLowerCase();
  const shapes = useMemo(() => CATALOG.filter((s) => s.category !== "Icons" && (!q || s.name.toLowerCase().includes(q))), [q]);
  const icons = useMemo(() => CATALOG.filter((s) => s.category === "Icons" && (!q || s.name.toLowerCase().includes(q))), [q]);
  const emoji = useMemo(() => (q ? EMOJI.filter((e) => e.name.includes(q) || e.group.toLowerCase().includes(q)) : EMOJI), [q]);

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      for (const f of Array.from(files)) await saveUpload(f);
      await reloadUploads();
    } catch (err) {
      useEditor.getState().notify("error", err instanceof Error ? err.message : "Couldn't save the upload.");
    }
  };

  const showSearch = section === "shapes" || section === "icons" || section === "emoji";

  return (
    <aside aria-label="Elements library" className="flex min-h-0 shrink-0 overflow-hidden border-r border-line bg-panel">
      {/* Icon rail */}
      <div className="flex w-14 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line px-1 py-2">
        <RailButton icon={LayoutTemplate} label="Templates" onClick={() => openTemplates(true)} />
        <RailButton icon={FileUp} label="Import" onClick={() => void importAnyFile()} />
        <RailButton icon={QrCode} label="Codes" onClick={() => openGenerator(true)} />
        <div className="mx-auto my-1 h-px w-7 bg-line" />
        {SECTIONS.map((s) => (
          <RailButton key={s.id} icon={s.icon} label={s.label} active={section === s.id} onClick={() => toggle(s.id)} />
        ))}
      </div>

      {/* Flyout content for the active section */}
      {section && (
        <div className="pop-in flex w-56 min-h-0 flex-col bg-panel max-lg:fixed max-lg:inset-y-0 max-lg:left-28 max-lg:top-12 max-lg:z-30 max-lg:border-l max-lg:border-line max-lg:shadow-pop">
          <div className="flex items-center justify-between px-3 pb-1 pt-3">
            <h2 className="font-display text-sm font-semibold capitalize tracking-tight">{section}</h2>
          </div>

          {showSearch && (
            <div className="px-3 pb-1">
              <span className="relative flex items-center">
                <Search className="pointer-events-none absolute left-2 size-3.5 text-ink-faint" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${section}…`}
                  aria-label={`Search ${section}`}
                  className="h-8 w-full rounded-control border border-line bg-raised pl-7 pr-2 text-sm"
                />
              </span>
            </div>
          )}

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {section === "text" && (
              <div className="flex flex-col gap-2">
                {TEXT_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => void addText(p.label.replace("Add ", "").replace("a ", ""), p.size)}
                    className={cn("rounded-control border border-line bg-raised px-3 py-3 text-left text-ink hover:border-ink", p.className)}
                  >
                    {p.label}
                  </button>
                ))}
                <p className="pt-1 text-xs text-ink-faint">Double-click text on the mat to edit it. Curve it from the inspector.</p>
              </div>
            )}

            {(section === "shapes" || section === "icons") && (
              <div className="grid grid-cols-3 gap-2">
                {(section === "shapes" ? shapes : icons).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    draggable
                    onDragStart={(ev) => ev.dataTransfer.setData(DND_MIME, serializeDragPayload({ t: "path", d: s.d, w: s.width, h: s.height, name: s.name }))}
                    onClick={() => insertShape(s)}
                    title={`${s.name} — click or drag onto the mat`}
                    className="group grid aspect-square place-items-center rounded-control border border-line bg-raised p-2 text-ink-soft transition-transform hover:-translate-y-0.5 hover:border-ink hover:text-ink active:translate-y-0"
                  >
                    <svg viewBox={`-2 -2 ${s.width + 4} ${s.height + 4}`} className="size-full" aria-hidden="true">
                      <path d={s.d} fill="currentColor" />
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {section === "emoji" && (
              <div className="grid grid-cols-5 gap-1.5">
                {emoji.map((e) => (
                  <button
                    key={e.char}
                    type="button"
                    draggable
                    onDragStart={(ev) => ev.dataTransfer.setData(DND_MIME, serializeDragPayload({ t: "emoji", char: e.char, name: e.name }))}
                    onClick={() => insertEmoji(e)}
                    title={`${e.name} — click or drag onto the mat`}
                    className="grid aspect-square place-items-center rounded-control border border-line bg-raised text-xl leading-none transition-transform hover:-translate-y-0.5 hover:border-ink active:translate-y-0"
                  >
                    <span aria-hidden="true">{e.char}</span>
                  </button>
                ))}
              </div>
            )}

            {section === "uploads" && (
              <div className="flex flex-col gap-2">
                <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-control bg-ink text-sm font-medium text-on-ink hover:opacity-90">
                  <Upload className="size-3.5" aria-hidden="true" />
                  Upload image
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onUpload(e.target.files)} />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {uploads.map((u) => (
                    <div key={u.id} className="group relative aspect-square overflow-hidden rounded-control border border-line bg-raised">
                      <button type="button" onClick={() => insertUpload(u)} title={`Add ${u.name}`} className="size-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u.dataUrl} alt={u.name} className="size-full object-contain p-1" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteUpload(u.id).then(reloadUploads)}
                        aria-label={`Delete ${u.name}`}
                        className="absolute right-1 top-1 hidden rounded bg-ink/80 px-1 text-xs text-on-ink group-hover:block"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
