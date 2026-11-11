"use client";

import { LayoutTemplate, QrCode, Search, Shapes, Smile, Sparkles, Type, Upload } from "lucide-react";
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

export function ElementsPanel() {
  const openTemplates = useEditor((s) => s.setTemplatesOpen);
  const openGenerator = useEditor((s) => s.setGeneratorOpen);
  const [section, setSection] = useState<Section>("shapes");
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

  return (
    <aside aria-label="Elements library" className="flex min-h-0 w-64 shrink-0 flex-col overflow-hidden border-r border-line bg-panel max-lg:w-56">
      <div className="flex items-center justify-between px-3 pt-3">
        <h2 className="font-display text-sm font-semibold tracking-tight">Elements</h2>
        <div className="flex gap-1">
          <button type="button" onClick={() => openTemplates(true)} title="Templates" className="grid size-7 place-items-center rounded-control text-ink-soft hover:bg-sunken">
            <LayoutTemplate className="size-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => openGenerator(true)} title="QR / barcode / monogram" className="grid size-7 place-items-center rounded-control text-ink-soft hover:bg-sunken">
            <QrCode className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="px-3 pt-2">
        <span className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2 size-3.5 text-ink-faint" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search elements…"
            aria-label="Search elements"
            className="h-8 w-full rounded-control border border-line bg-raised pl-7 pr-2 text-sm"
          />
        </span>
      </div>

      <div className="scroll-thin flex gap-1 overflow-x-auto px-3 py-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
              section === s.id ? "border-ink bg-ink text-on-ink" : "border-line text-ink-soft hover:border-line-strong",
            )}
          >
            <s.icon className="size-3.5" aria-hidden="true" />
            {s.label}
          </button>
        ))}
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3">
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
                className="group grid aspect-square place-items-center rounded-control border border-line bg-raised p-2 text-ink-soft hover:border-ink hover:text-ink"
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
                className="grid aspect-square place-items-center rounded-control border border-line bg-raised text-xl leading-none hover:border-ink"
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
    </aside>
  );
}
