"use client";

import { Dialog } from "radix-ui";
import { Keyboard, X } from "lucide-react";
import { SHORTCUT_GROUPS } from "@/lib/ui/shortcuts";
import { useEditor } from "@/store/editorStore";

/** A read-only cheat sheet of keyboard shortcuts, opened with "?" or the help button. */
export function ShortcutsDialog() {
  const open = useEditor((s) => s.helpOpen);
  const setOpen = useEditor((s) => s.setHelpOpen);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm" />
        <Dialog.Content
          className="pop-in fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(640px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-pop bg-panel shadow-pop outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <Keyboard className="size-4 text-ink-soft" aria-hidden="true" />
            <Dialog.Title className="font-display text-[15px] font-semibold tracking-tight">Keyboard shortcuts</Dialog.Title>
            <Dialog.Close className="ml-auto grid size-7 place-items-center rounded-control text-ink-soft hover:bg-sunken" aria-label="Close">
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="scroll-thin grid min-h-0 grid-cols-1 gap-x-8 gap-y-5 overflow-y-auto p-4 sm:grid-cols-2">
            {SHORTCUT_GROUPS.map((g) => (
              <section key={g.title}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{g.title}</h3>
                <dl className="flex flex-col gap-1.5">
                  {g.items.map((it) => (
                    <div key={it.keys} className="flex items-center justify-between gap-3 text-sm">
                      <dt className="text-ink-soft">{it.label}</dt>
                      <dd>
                        <kbd className="rounded-control border border-line bg-sunken px-1.5 py-0.5 font-mono text-xs text-ink">
                          {it.keys}
                        </kbd>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
