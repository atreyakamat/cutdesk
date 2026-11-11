"use client";

import { Dialog } from "radix-ui";
import { Copy, Download, LayoutTemplate, Pencil, Save, Trash2, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { worldPolylines } from "@/lib/doc/geometry";
import { newId } from "@/lib/doc/ids";
import {
  BUILTIN_TEMPLATES,
  deleteUserTemplate,
  duplicateUserTemplate,
  listUserTemplates,
  saveUserTemplate,
  updateUserTemplate,
  type TemplateDef,
  type UserTemplate,
} from "@/lib/doc/templates";
import { exportTemplatesFile, importTemplatesFile } from "@/lib/files";
import type { Doc } from "@/lib/doc/types";
import { useEditor } from "@/store/editorStore";
import { Button } from "./ui/Controls";

/** Schematic preview: the mat with every object's outline, in mat coordinates. */
function Thumb({ doc }: { doc: Doc }) {
  const paths = doc.objects.flatMap((o) =>
    worldPolylines(o).map((pl) => pl.points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")),
  );
  return (
    <svg viewBox={`0 0 ${doc.mat.width} ${doc.mat.height}`} className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x={0} y={0} width={doc.mat.width} height={doc.mat.height} className="fill-sunken stroke-line" strokeWidth={doc.mat.width / 120} />
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" className="stroke-ink" strokeWidth={doc.mat.width / 120} />
      ))}
    </svg>
  );
}

function cloneDoc(d: Doc): Doc {
  return { ...d, layers: d.layers.map((l) => ({ ...l })), objects: d.objects.map((o) => ({ ...o, id: newId() })) };
}

const iconBtn = "grid size-6 place-items-center rounded bg-ink/80 text-on-ink hover:bg-ink";

export function TemplatesDialog() {
  const open = useEditor((s) => s.templatesOpen);
  const setOpen = useEditor((s) => s.setTemplatesOpen);
  const docName = useEditor((s) => s.doc.name);
  // `name` starts null and shows the active page's name until the user types.
  const [name, setName] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const renameCancelled = useRef(false);
  const saved = useMemo<UserTemplate[]>(() => {
    void version; // re-read local storage after a save, edit, import or delete
    return open ? listUserTemplates() : [];
  }, [open, version]);
  const value = name ?? docName;
  const refresh = () => setVersion((v) => v + 1);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setName(null);
      setCategory("");
      setDescription("");
      setEditingId(null);
    }
  };

  const applyBuiltin = (t: TemplateDef) => {
    useEditor.getState().addPageFromDoc(t.build());
    useEditor.getState().notify("info", `Added a “${t.name}” page.`);
    setOpen(false);
  };

  const applyUser = (t: UserTemplate) => {
    useEditor.getState().addPageFromDoc(cloneDoc(t.doc));
    useEditor.getState().notify("info", `Added a “${t.name}” page.`);
    setOpen(false);
  };

  const saveCurrent = () => {
    const ok = saveUserTemplate(value, cloneDoc(useEditor.getState().doc), { category, description });
    if (ok) {
      refresh();
      setName(null);
      setCategory("");
      setDescription("");
      useEditor.getState().notify("info", "Saved this page as a template on this device.");
    } else {
      useEditor.getState().notify("error", "Couldn't save the template (storage full or unavailable).");
    }
  };

  const commitRename = (id: string) => {
    if (renameCancelled.current) {
      renameCancelled.current = false;
      return;
    }
    updateUserTemplate(id, { name: editName });
    setEditingId(null);
    refresh();
  };

  // Group saved templates by category for a tidy builder view.
  const grouped = useMemo(() => {
    const map = new Map<string, UserTemplate[]>();
    for (const t of saved) {
      const key = t.category?.trim() || "Uncategorised";
      (map.get(key) ?? map.set(key, []).get(key)!).push(t);
    }
    return [...map.entries()];
  }, [saved]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm" />
        <Dialog.Content
          className="pop-in fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-pop bg-panel shadow-pop outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <LayoutTemplate className="size-4 text-ink-soft" aria-hidden="true" />
            <Dialog.Title className="font-display text-[15px] font-semibold tracking-tight">Templates &amp; builder</Dialog.Title>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" onClick={exportTemplatesFile} title="Export your templates to a file">
                <Download className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Export</span>
              </Button>
              <Button variant="ghost" onClick={() => void importTemplatesFile().then((n) => n > 0 && refresh())} title="Import templates from a file">
                <Upload className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Import</span>
              </Button>
              <Dialog.Close className="grid size-7 place-items-center rounded-control text-ink-soft hover:bg-sunken" aria-label="Close">
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </div>
          </div>

          {/* Builder: save the current page as a reusable template */}
          <div className="flex flex-col gap-2 border-b border-line bg-sunken/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <input
                value={value}
                onChange={(e) => setName(e.target.value)}
                placeholder="Template name"
                aria-label="Template name"
                maxLength={80}
                className="h-8 min-w-0 flex-[2] rounded-control border border-line bg-raised px-2 text-sm"
              />
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Category (optional)"
                aria-label="Template category"
                maxLength={40}
                className="h-8 min-w-0 flex-1 rounded-control border border-line bg-raised px-2 text-sm"
              />
              <Button variant="primary" onClick={saveCurrent}>
                <Save className="size-3.5" aria-hidden="true" />
                Save page
              </Button>
            </div>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description (optional)"
              aria-label="Template description"
              maxLength={120}
              className="h-8 w-full rounded-control border border-line bg-raised px-2 text-sm"
            />
          </div>

          <div className="scroll-thin min-h-0 overflow-y-auto p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Starter templates</h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {BUILTIN_TEMPLATES.map((t) => {
                const doc = t.build();
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyBuiltin(t)}
                    className="group flex flex-col overflow-hidden rounded-control border border-line bg-raised text-left transition-transform hover:-translate-y-0.5 hover:border-ink"
                  >
                    <span className="aspect-square border-b border-line p-2">
                      <Thumb doc={doc} />
                    </span>
                    <span className="px-2.5 py-2">
                      <span className="block text-sm font-medium">{t.name}</span>
                      <span className="block text-xs text-ink-faint">{t.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {grouped.map(([cat, items]) => (
              <div key={cat}>
                <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-faint">{cat}</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                  {items.map((t) => (
                    <div key={t.id} className="group relative flex flex-col overflow-hidden rounded-control border border-line bg-raised transition-transform hover:-translate-y-0.5">
                      <button type="button" onClick={() => applyUser(t)} className="flex flex-col text-left hover:opacity-90" title={t.description || t.name}>
                        <span className="aspect-square border-b border-line p-2">
                          <Thumb doc={t.doc} />
                        </span>
                        {editingId === t.id ? (
                          <input
                            autoFocus
                            value={editName}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename(t.id);
                              if (e.key === "Escape") {
                                renameCancelled.current = true;
                                setEditingId(null);
                              }
                            }}
                            onBlur={() => commitRename(t.id)}
                            maxLength={80}
                            className="m-1.5 h-7 rounded border border-ink bg-raised px-1.5 text-sm"
                          />
                        ) : (
                          <span className="truncate px-2.5 py-2 text-sm font-medium" title={t.name}>
                            {t.name}
                          </span>
                        )}
                      </button>
                      <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(t.id);
                            setEditName(t.name);
                          }}
                          aria-label={`Rename ${t.name}`}
                          className={iconBtn}
                        >
                          <Pencil className="size-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            duplicateUserTemplate(t.id);
                            refresh();
                          }}
                          aria-label={`Duplicate ${t.name}`}
                          className={iconBtn}
                        >
                          <Copy className="size-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            deleteUserTemplate(t.id);
                            refresh();
                          }}
                          aria-label={`Delete ${t.name}`}
                          className={iconBtn}
                        >
                          <Trash2 className="size-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
