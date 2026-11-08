"use client";

import { Dialog } from "radix-ui";
import { QrCode, X } from "lucide-react";
import { useMemo, useState } from "react";
import { code39Path } from "@/lib/doc/barcode";
import { qrPath } from "@/lib/doc/qr";
import type { FrameKind } from "@/lib/doc/monogram";
import type { FontId } from "@/lib/doc/types";
import { FONTS } from "@/lib/text/fonts";
import { useEditor } from "@/store/editorStore";
import { Button, Select } from "./ui/Controls";

type Tab = "qr" | "barcode" | "monogram";

/** Generate a QR code or a Code 39 barcode as a cut-ready path. */
export function GeneratorDialog() {
  const open = useEditor((s) => s.generatorOpen);
  const setOpen = useEditor((s) => s.setGeneratorOpen);
  const [tab, setTab] = useState<Tab>("qr");
  const [text, setText] = useState("https://stixnvibes.com");
  const [size, setSize] = useState(40);
  const [font, setFont] = useState<FontId>("lilita");
  const [frame, setFrame] = useState<FrameKind>("none");

  const preview = useMemo(() => {
    if (tab === "monogram") return null;
    try {
      return tab === "qr" ? qrPath(text, { sizeMm: size }) : code39Path(text, { heightMm: size });
    } catch {
      return null;
    }
  }, [tab, text, size]);

  const canAdd = tab === "monogram" ? text.trim().length > 0 : !!preview && !!preview.d;

  const add = () => {
    if (tab === "qr") useEditor.getState().addQrCode(text, size);
    else if (tab === "barcode") useEditor.getState().addBarcode(text, size);
    else void useEditor.getState().addMonogram(text, font, frame);
    setOpen(false);
  };

  const chip = (t: Tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      className={`rounded-[4px] px-3 py-1 text-sm ${tab === t ? "bg-raised text-ink shadow-sm" : "text-ink-soft"}`}
    >
      {label}
    </button>
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm" />
        <Dialog.Content
          className="pop-in fixed left-1/2 top-1/2 z-50 flex w-[min(520px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-pop bg-panel shadow-pop outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <QrCode className="size-4 text-ink-soft" aria-hidden="true" />
            <Dialog.Title className="font-display text-[15px] font-semibold tracking-tight">Generate</Dialog.Title>
            <div className="flex rounded-control bg-sunken p-0.5">
              {chip("qr", "QR code")}
              {chip("barcode", "Barcode")}
              {chip("monogram", "Monogram")}
            </div>
            <Dialog.Close className="ml-auto grid size-7 place-items-center rounded-control text-ink-soft hover:bg-sunken" aria-label="Close">
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-3 p-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-soft">
                {tab === "qr" ? "Text or URL" : tab === "barcode" ? "Text (A–Z, 0–9, - . $ / + %)" : "Name or initials"}
              </span>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label="Content"
                className="h-9 rounded-control border border-line bg-raised px-2.5 text-sm"
              />
            </label>

            {tab !== "monogram" ? (
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <span className="w-28">{tab === "qr" ? "Size (mm)" : "Height (mm)"}</span>
                <input
                  type="range"
                  min={tab === "qr" ? 15 : 8}
                  max={tab === "qr" ? 150 : 60}
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  aria-label="Size"
                  className="flex-1"
                />
                <span className="w-10 text-right tabular-nums">{size}</span>
              </label>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Select aria-label="Font" value={font} onChange={(e) => setFont(e.target.value as FontId)}>
                  {FONTS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </Select>
                <Select aria-label="Frame" value={frame} onChange={(e) => setFrame(e.target.value as FrameKind)}>
                  <option value="none">No frame</option>
                  <option value="circle">Circle frame</option>
                  <option value="diamond">Diamond frame</option>
                </Select>
              </div>
            )}

            <div className="grid h-40 place-items-center rounded-control border border-line bg-bench p-3">
              {tab === "monogram" ? (
                <span className="truncate text-4xl font-semibold text-ink">{text.trim() || "AB"}</span>
              ) : preview && preview.d ? (
                <svg viewBox={`0 0 ${preview.width} ${preview.height}`} className="max-h-full max-w-full" aria-label="Preview">
                  <path d={preview.d} className="fill-ink" />
                </svg>
              ) : (
                <p className="text-sm text-ink-faint">{tab === "barcode" ? "Enter some supported characters." : "Enter text to encode."}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!canAdd} onClick={add}>
              Add to mat
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
