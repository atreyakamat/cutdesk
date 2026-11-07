"use client";

import { Dialog } from "radix-ui";
import { LayoutTemplate, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { worldPolylines } from "@/lib/doc/geometry";
import { newId } from "@/lib/doc/ids";
import {
  BUILTIN_TEMPLATES,
  deleteUserTemplate,
  listUserTemplates,
  saveUserTemplate,
  type TemplateDef,
  type UserTemplate,
} from "@/lib/doc/templates";
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

export function TemplatesDialog() {
  const open = useEditor((s) => s.templatesOpen);
  const setOpen = useEditor((s) => s.setTemplatesOpen);
  const docName = useEditor((s) => s.doc.name);
  // `name` starts null and shows the active page's name until the user types.
  const [name, setName] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const saved = useMemo<UserTemplate[]>(() => {
    void version; // re-read local storage after a save or delete
    return open ? listUserTemplates() : [];
  }, [open, version]);
  const value = name ?? docName;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setName(null);
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
    const ok = saveUserTemplate(value, cloneDoc(useEditor.getState().doc));
    if (ok) {
      setVersion((v) => v + 1);
      useEditor.getState().notify("info", "Saved this page as a template on this device.");
    } else {
      useEditor.getState().notify("error", "Couldn't save the template (storage full or unavailable).");
    }
  };

  const remove = (id: string) => {
    deleteUserTemplate(id);
    setVersion((v) => v + 1);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm" />
        <Dialog.Content
          className="pop-in fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-pop bg-panel shadow-pop outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <LayoutTemplate className="size-4 text-ink-soft" aria-hidden="true" />
            <Dialog.Title className="font-display text-[15px] font-semibold tracking-tight">Templates</Dialog.Title>
            <Dialog.Close className="ml-auto grid size-7 place-items-center rounded-control text-ink-soft hover:bg-sunken" aria-label="Close">
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <input
              value={value}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template name"
              aria-label="Template name"
              maxLength={80}
              className="h-8 min-w-0 flex-1 rounded-control border border-line bg-raised px-2 text-sm"
            />
            <Button variant="secondary" onClick={saveCurrent}>
              <Save className="size-3.5" aria-hidden="true" />
              Save this page
            </Button>
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
                    className="group flex flex-col overflow-hidden rounded-control border border-line bg-raised text-left hover:border-ink"
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

            {saved.length > 0 && (
              <>
                <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Your templates</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                  {saved.map((t) => (
                    <div key={t.id} className="group relative flex flex-col overflow-hidden rounded-control border border-line bg-raised">
                      <button type="button" onClick={() => applyUser(t)} className="flex flex-col text-left hover:opacity-90">
                        <span className="aspect-square border-b border-line p-2">
                          <Thumb doc={t.doc} />
                        </span>
                        <span className="truncate px-2.5 py-2 text-sm font-medium" title={t.name}>
                          {t.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(t.id)}
                        aria-label={`Delete ${t.name}`}
                        className="absolute right-1 top-1 hidden rounded bg-ink/80 p-1 text-on-ink group-hover:block"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
