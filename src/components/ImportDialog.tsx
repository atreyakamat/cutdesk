"use client";

import { ImagePlus, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { fromMm, toMm, unitPrecision } from "@/lib/doc/units";
import { traceImage, TraceError, type TraceMode, type TraceResult } from "@/lib/trace/trace";
import { pickFile } from "@/lib/files";
import { useEditor, type NewObject } from "@/store/editorStore";
import { Button, Row, Select, Toggle } from "./ui/Controls";
import { NumberField } from "./ui/NumberField";

const WORK_PX = 640;

interface Loaded {
  src: string;
  canvasData: ImageData;
  aspect: number;
  name: string;
}

async function loadImage(file: File): Promise<Loaded> {
  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that file."));
    r.readAsDataURL(file);
  });
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("That file isn't an image the browser can open."));
    img.src = src;
  });
  const k = Math.min(1, WORK_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser can't read image pixels.");
  ctx.drawImage(img, 0, 0, w, h);
  return { src, canvasData: ctx.getImageData(0, 0, w, h), aspect: w / h, name: file.name.replace(/\.[^.]+$/, "") };
}

/** Mounted only while open, so every visit starts with fresh state. */
export function ImportDialog() {
  const open = useEditor((s) => s.importOpen);
  return open ? <ImportInner /> : null;
}

function ImportInner() {
  const file = useEditor((s) => s.importFile);
  const close = useEditor((s) => s.closeImport);
  const unit = useEditor((s) => s.doc.unit);

  const [img, setImg] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<TraceMode>("outline");
  const [widthMm, setWidthMm] = useState(80);
  const [offsetMm, setOffsetMm] = useState(2);
  const [threshold, setThreshold] = useState(128);
  const [invert, setInvert] = useState(false);
  const [holes, setHoles] = useState(true);
  const [smoothing, setSmoothing] = useState(4);
  const [keepRef, setKeepRef] = useState(true);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useRef(0);

  // Load the file that opened the dialog.
  useEffect(() => {
    if (!file) return;
    let live = true;
    loadImage(file)
      .then((l) => live && (setImg(l), setError(null)))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't open that image."));
    return () => {
      live = false;
    };
  }, [file]);

  // Trace after changes settle.
  useEffect(() => {
    if (!img) return;
    const id = ++run.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flags the debounce window
    setBusy(true);
    const t = setTimeout(() => {
      if (id !== run.current) return;
      try {
        const r = traceImage(img.canvasData, {
          mode,
          source: "auto",
          threshold,
          invert,
          offsetMm,
          fillHoles: holes,
          smoothing,
          widthMm,
        });
        setResult(r);
        setError(null);
      } catch (e) {
        setResult(null);
        setError(e instanceof TraceError ? e.message : "Tracing failed for this image.");
      } finally {
        if (id === run.current) setBusy(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [img, mode, threshold, invert, offsetMm, holes, smoothing, widthMm]);

  const choose = async () => {
    const f = await pickFile("image/*");
    if (f) useEditor.getState().openImport(f);
  };

  const add = () => {
    if (!img || !result) return;
    const st = useEditor.getState();
    const s = result.mmPerPx;
    const frameW = (img.canvasData.width + result.pad * 2) * s;
    const frameH = (img.canvasData.height + result.pad * 2) * s;
    const { mat } = st.doc;
    const x0 = Math.max(0, (mat.width - frameW) / 2);
    const y0 = Math.max(0, (mat.height - frameH) / 2);

    let layerId = st.activeLayerId;
    const active = st.doc.layers.find((l) => l.id === layerId);
    if (!active || active.operation !== "cut") {
      layerId = st.doc.layers.find((l) => l.operation === "cut")?.id ?? st.addLayer("cut");
    }

    const items: NewObject[] = [
      {
        name: `${img.name} outline`,
        layerId,
        geo: { kind: "path", d: result.d },
        init: { x: x0 + result.originX * s, y: y0 + result.originY * s, scaleX: s, scaleY: s },
      },
    ];

    if (keepRef) {
      let refId = st.doc.layers.find((l) => l.operation === "print")?.id;
      if (!refId) refId = st.addLayer("print");
      items.unshift({
        name: img.name,
        layerId: refId,
        geo: { kind: "image", src: img.src, width: img.canvasData.width, height: img.canvasData.height },
        init: { x: x0 + result.pad * s, y: y0 + result.pad * s, scaleX: s, scaleY: s },
      });
    }
    st.addObjects(items);
    st.notify("info", "Added. Move or resize the outline and its artwork together by selecting both.");
    close();
  };

  const prec = unitPrecision(unit);

  return (
    <Dialog.Root open onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="pop-in fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[min(56rem,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-pop bg-panel shadow-pop md:flex-row">
          <div className="grid min-h-48 flex-1 place-items-center bg-bench p-4">
            {result && img ? (
              <svg
                role="img"
                aria-label="Preview of the traced outline"
                viewBox={`0 0 ${img.canvasData.width + result.pad * 2} ${img.canvasData.height + result.pad * 2}`}
                className="max-h-[60dvh] w-full"
              >
                <image
                  href={img.src}
                  x={result.pad}
                  y={result.pad}
                  width={img.canvasData.width}
                  height={img.canvasData.height}
                  opacity={0.55}
                />
                <path
                  d={result.d}
                  transform={`translate(${result.originX} ${result.originY})`}
                  fill="rgba(199,33,31,0.12)"
                  stroke="#c7211f"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            ) : (
              <div className="text-center text-sm text-ink-soft">
                {error ? (
                  <p role="alert" className="max-w-xs text-blade">
                    {error}
                  </p>
                ) : (
                  <p>{img ? "Tracing…" : "Choose a PNG, JPG or SVG to trace."}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex w-full shrink-0 flex-col overflow-y-auto md:w-80">
            <div className="flex items-start justify-between border-b border-line px-4 py-3">
              <div>
                <Dialog.Title className="font-display text-lg font-semibold tracking-tight">Trace an image</Dialog.Title>
                <Dialog.Description className="text-sm text-ink-soft">Turn artwork into a cut line.</Dialog.Description>
              </div>
              <Dialog.Close aria-label="Close" className="grid size-8 place-items-center rounded-control hover:bg-sunken">
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </div>

            <div className="flex flex-col gap-2.5 px-4 py-3">
              <Button onClick={() => void choose()}>
                <ImagePlus className="size-3.5" aria-hidden="true" />
                {img ? "Choose another image" : "Choose an image"}
              </Button>
              <Row label="Trace as">
                <Select aria-label="Trace as" value={mode} onChange={(e) => setMode(e.target.value as TraceMode)}>
                  <option value="outline">Sticker outline</option>
                  <option value="shapes">Shapes</option>
                </Select>
              </Row>
              <NumberField
                label="Width"
                unit={unit}
                precision={prec}
                min={fromMm(10, unit)}
                max={fromMm(600, unit)}
                value={fromMm(widthMm, unit)}
                onCommit={(v) => setWidthMm(toMm(v, unit))}
              />
              {mode === "outline" && (
                <>
                  <NumberField
                    label="Border"
                    ariaLabel="Border around the artwork"
                    unit={unit}
                    precision={prec}
                    min={0}
                    max={fromMm(30, unit)}
                    step={unit === "mm" ? 0.5 : 0.02}
                    value={fromMm(offsetMm, unit)}
                    onCommit={(v) => setOffsetMm(toMm(v, unit))}
                  />
                  <Row label="Ignore inner holes">
                    <Toggle label="Ignore inner holes" checked={holes} onCheckedChange={setHoles} />
                  </Row>
                </>
              )}
              <NumberField label="Threshold" ariaLabel="Darkness threshold" min={0} max={255} precision={0} value={threshold} onCommit={setThreshold} />
              <NumberField label="Smoothing" min={0} max={10} precision={0} value={smoothing} onCommit={setSmoothing} />
              <Row label="Invert">
                <Toggle label="Invert" checked={invert} onCheckedChange={setInvert} />
              </Row>
              <Row label="Keep artwork as reference">
                <Toggle label="Keep artwork as reference" checked={keepRef} onCheckedChange={setKeepRef} />
              </Row>
            </div>

            <div className="mt-auto flex justify-end gap-2 border-t border-line px-4 py-3">
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!result || busy} onClick={add}>
                Add to mat
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
