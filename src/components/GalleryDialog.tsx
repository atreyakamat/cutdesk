"use client";

import { Dialog } from "radix-ui";
import { Search, Shapes, Trash2, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { CATALOG, CATEGORIES, type GalleryShape } from "@/lib/gallery/catalog";
import { GLYPHS_CATEGORY, generateGlyphs } from "@/lib/gallery/glyphs";
import { EMOJI, emojiToDataUrl, type EmojiItem } from "@/lib/gallery/emoji";
import { fetchCatalog, getCatalogUrl, loadRemoteImage, setCatalogUrl, type RemoteItem } from "@/lib/gallery/remote";
import { deleteUpload, listUploads, saveUpload, type Upload as GalleryUpload } from "@/lib/gallery/uploads";
import { useEditor } from "@/store/editorStore";
import { Button } from "./ui/Controls";
import { IconButton } from "./ui/IconButton";

type Tab = "shapes" | "emoji" | "uploads" | "catalog";

export function GalleryDialog() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("shapes");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [uploads, setUploads] = useState<GalleryUpload[]>([]);
  const [glyphs, setGlyphs] = useState<GalleryShape[]>([]);
  const [loadingGlyphs, setLoadingGlyphs] = useState(false);
  const [catalogUrl, setCatalogUrlState] = useState(() => getCatalogUrl());
  const [catalogItems, setCatalogItems] = useState<RemoteItem[]>([]);
  const [catalogState, setCatalogState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });

  const reloadUploads = async () => {
    try {
      setUploads(await listUploads());
    } catch {
      setUploads([]);
    }
  };

  const shapes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const src = category === GLYPHS_CATEGORY ? glyphs : CATALOG.filter((s) => category === "All" || s.category === category);
    return src.filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [query, category, glyphs]);

  const selectCategory = async (c: string) => {
    setCategory(c);
    if (c === GLYPHS_CATEGORY && glyphs.length === 0) {
      setLoadingGlyphs(true);
      try {
        setGlyphs(await generateGlyphs());
      } catch {
        useEditor.getState().notify("error", "Couldn't generate the letters.");
      } finally {
        setLoadingGlyphs(false);
      }
    }
  };

  const insertShape = (s: GalleryShape) => {
    const { doc, addObject, notify } = useEditor.getState();
    addObject({
      geo: { kind: "path", d: s.d },
      name: s.name,
      init: { x: doc.mat.width / 2 - s.width / 2, y: doc.mat.height / 2 - s.height / 2 },
    });
    notify("info", `Added ${s.name} to the mat.`);
    setOpen(false);
  };

  const emojiList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? EMOJI.filter((e) => e.name.includes(q) || e.group.toLowerCase().includes(q)) : EMOJI;
  }, [query]);

  const insertEmoji = (e: EmojiItem) => {
    const src = emojiToDataUrl(e.char);
    if (!src) {
      useEditor.getState().notify("error", "Couldn't render that emoji here.");
      return;
    }
    const { doc, addObject, notify } = useEditor.getState();
    const s = 60;
    addObject({
      geo: { kind: "image", src, width: s, height: s },
      name: e.name,
      init: { x: doc.mat.width / 2 - s / 2, y: doc.mat.height / 2 - s / 2 },
    });
    notify("info", `Added ${e.name} — trace it to cut.`);
    setOpen(false);
  };

  const catalogList = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? catalogItems.filter((i) => i.name.toLowerCase().includes(q) || (i.category ?? "").toLowerCase().includes(q))
      : catalogItems;
    return filtered.slice(0, 500);
  }, [query, catalogItems]);

  const loadCatalog = async () => {
    const url = catalogUrl.trim();
    if (!url) return;
    setCatalogState({ loading: true, error: null });
    try {
      const items = await fetchCatalog(url);
      setCatalogItems(items);
      setCatalogUrl(url);
      setCatalogState({ loading: false, error: null });
    } catch (err) {
      setCatalogItems([]);
      setCatalogState({ loading: false, error: err instanceof Error ? err.message : "Couldn't load that catalog." });
    }
  };

  const insertRemote = async (it: RemoteItem) => {
    const { doc, addObject, notify } = useEditor.getState();
    const center = (w: number, h: number) => ({ x: doc.mat.width / 2 - w / 2, y: doc.mat.height / 2 - h / 2 });
    try {
      if (it.type === "path" && it.d) {
        const w = it.width ?? 60;
        const h = it.height ?? 60;
        addObject({ geo: { kind: "path", d: it.d }, name: it.name, init: center(w, h) });
      } else if (it.type === "image" && it.url) {
        const img = await loadRemoteImage(it.url);
        const w = it.width ?? (80 / Math.max(img.width, img.height)) * img.width;
        const h = it.height ?? (80 / Math.max(img.width, img.height)) * img.height;
        addObject({ geo: { kind: "image", src: img.dataUrl, width: w, height: h }, name: it.name, init: center(w, h) });
      }
      notify("info", `Added ${it.name}.`);
      setOpen(false);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Couldn't add that item (CORS?).");
    }
  };

  const insertUpload = (u: GalleryUpload) => {
    const { doc, addObject, notify } = useEditor.getState();
    const scale = 80 / Math.max(u.width, u.height);
    const w = u.width * scale;
    const h = u.height * scale;
    addObject({
      geo: { kind: "image", src: u.dataUrl, width: w, height: h },
      name: u.name,
      init: { x: doc.mat.width / 2 - w / 2, y: doc.mat.height / 2 - h / 2 },
    });
    notify("info", `Added ${u.name} to the mat.`);
    setOpen(false);
  };

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      for (const f of Array.from(files)) await saveUpload(f);
      await reloadUploads();
    } catch (err) {
      useEditor.getState().notify("error", err instanceof Error ? err.message : "Couldn't save the upload.");
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteUpload(id);
      await reloadUploads();
    } catch {
      /* ignore */
    }
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    if (next === "uploads") void reloadUploads();
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && tab === "uploads") void reloadUploads();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <IconButton icon={Shapes} label="Shapes & uploads" tipSide="right" onClick={() => setOpen(true)} />
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm" />
        <Dialog.Content
          className="pop-in fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-pop bg-panel shadow-pop outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <Dialog.Title className="font-display text-[15px] font-semibold tracking-tight">Gallery</Dialog.Title>
            <div className="flex rounded-control bg-sunken p-0.5 text-sm">
              <button
                type="button"
                onClick={() => switchTab("shapes")}
                className={`rounded-[4px] px-3 py-1 ${tab === "shapes" ? "bg-raised text-ink shadow-sm" : "text-ink-soft"}`}
              >
                Shapes
              </button>
              <button
                type="button"
                onClick={() => switchTab("emoji")}
                className={`rounded-[4px] px-3 py-1 ${tab === "emoji" ? "bg-raised text-ink shadow-sm" : "text-ink-soft"}`}
              >
                Emoji
              </button>
              <button
                type="button"
                onClick={() => switchTab("uploads")}
                className={`rounded-[4px] px-3 py-1 ${tab === "uploads" ? "bg-raised text-ink shadow-sm" : "text-ink-soft"}`}
              >
                Uploads
              </button>
              <button
                type="button"
                onClick={() => switchTab("catalog")}
                className={`rounded-[4px] px-3 py-1 ${tab === "catalog" ? "bg-raised text-ink shadow-sm" : "text-ink-soft"}`}
              >
                Catalog
              </button>
            </div>
            <Dialog.Close className="ml-auto grid size-7 place-items-center rounded-control text-ink-soft hover:bg-sunken" aria-label="Close">
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          {tab === "shapes" && (
            <div className="flex min-h-0 flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
                <span className="relative flex min-w-40 flex-1 items-center">
                  <Search className="pointer-events-none absolute left-2 size-3.5 text-ink-faint" aria-hidden="true" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search shapes…"
                    aria-label="Search shapes"
                    className="h-8 w-full rounded-control border border-line bg-raised pl-7 pr-2 text-sm"
                  />
                </span>
                <div className="flex flex-wrap gap-1">
                  {["All", ...CATEGORIES, GLYPHS_CATEGORY].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => void selectCategory(c)}
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        category === c ? "border-ink bg-ink text-on-ink" : "border-line text-ink-soft hover:border-line-strong"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="scroll-thin grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2 overflow-y-auto p-4">
                {loadingGlyphs && category === GLYPHS_CATEGORY && (
                  <p className="col-span-full py-8 text-center text-sm text-ink-faint">Generating letters…</p>
                )}
                {shapes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => insertShape(s)}
                    title={s.name}
                    className="group flex aspect-square flex-col items-center justify-center rounded-control border border-line bg-raised p-2 text-ink-soft hover:border-ink hover:text-ink"
                  >
                    <svg viewBox={`-2 -2 ${s.width + 4} ${s.height + 4}`} className="size-full" aria-hidden="true">
                      <path d={s.d} fill="currentColor" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "emoji" && (
            <div className="flex min-h-0 flex-col">
              <div className="border-b border-line px-4 py-2.5">
                <span className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-2 size-3.5 text-ink-faint" aria-hidden="true" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search emoji…"
                    aria-label="Search emoji"
                    className="h-8 w-full rounded-control border border-line bg-raised pl-7 pr-2 text-sm"
                  />
                </span>
              </div>
              <div className="scroll-thin grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1.5 overflow-y-auto p-4">
                {emojiList.map((e) => (
                  <button
                    key={e.char}
                    type="button"
                    onClick={() => insertEmoji(e)}
                    title={e.name}
                    className="grid aspect-square place-items-center rounded-control border border-line bg-raised text-2xl leading-none hover:border-ink"
                  >
                    <span aria-hidden="true">{e.char}</span>
                  </button>
                ))}
              </div>
              <p className="border-t border-line px-4 py-2 text-xs text-ink-faint">
                Emoji are placed as images — use Trace to turn one into cut paths.
              </p>
            </div>
          )}

          {tab === "uploads" && (
            <div className="flex min-h-0 flex-col">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <span className="text-sm text-ink-soft">{uploads.length} image(s) on this device</span>
                <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-control bg-ink px-3 text-sm font-medium text-on-ink hover:opacity-90">
                  <Upload className="size-3.5" aria-hidden="true" />
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => void onUpload(e.target.files)}
                  />
                </label>
              </div>
              <div className="scroll-thin grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 overflow-y-auto p-4">
                {uploads.length === 0 ? (
                  <p className="col-span-full py-8 text-center text-sm text-ink-faint">
                    No uploads yet. Images you add stay on this device.
                  </p>
                ) : (
                  uploads.map((u) => (
                    <div key={u.id} className="group relative aspect-square overflow-hidden rounded-control border border-line bg-raised">
                      <button type="button" onClick={() => insertUpload(u)} title={`Add ${u.name}`} className="size-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u.dataUrl} alt={u.name} className="size-full object-contain p-1" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDelete(u.id)}
                        aria-label={`Delete ${u.name}`}
                        className="absolute right-1 top-1 hidden rounded bg-ink/80 p-1 text-on-ink group-hover:block"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === "catalog" && (
            <div className="flex min-h-0 flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
                <input
                  value={catalogUrl}
                  onChange={(e) => setCatalogUrlState(e.target.value)}
                  placeholder="https://your-shop.example/catalog.json"
                  aria-label="Catalog manifest URL"
                  className="h-8 min-w-48 flex-1 rounded-control border border-line bg-raised px-2 font-mono text-xs"
                />
                <Button variant="primary" onClick={() => void loadCatalog()} disabled={catalogState.loading || !catalogUrl.trim()}>
                  {catalogState.loading ? "Loading…" : "Load"}
                </Button>
                {catalogItems.length > 0 && (
                  <span className="relative flex min-w-32 flex-1 items-center">
                    <Search className="pointer-events-none absolute left-2 size-3.5 text-ink-faint" aria-hidden="true" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search catalog…"
                      aria-label="Search catalog"
                      className="h-8 w-full rounded-control border border-line bg-raised pl-7 pr-2 text-sm"
                    />
                  </span>
                )}
              </div>
              {catalogState.error ? (
                <p className="px-4 py-8 text-center text-sm text-blade">{catalogState.error}</p>
              ) : catalogItems.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-faint">
                  Point this at a CutDesk catalog manifest (JSON) to load your library. The host must allow CORS.
                </p>
              ) : (
                <div className="scroll-thin grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2 overflow-y-auto p-4">
                  {catalogList.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => void insertRemote(it)}
                      title={it.name}
                      className="group flex aspect-square items-center justify-center overflow-hidden rounded-control border border-line bg-raised p-2 text-ink-soft hover:border-ink hover:text-ink"
                    >
                      {it.type === "path" && it.d ? (
                        <svg viewBox={`-2 -2 ${(it.width ?? 60) + 4} ${(it.height ?? 60) + 4}`} className="size-full" aria-hidden="true">
                          <path d={it.d} fill="currentColor" />
                        </svg>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.url} alt={it.name} className="size-full object-contain" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
