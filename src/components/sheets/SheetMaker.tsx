"use client";

import { useEffect, useRef, useState } from "react";
import { dilate, maskFromRgba, nest, type NestItem, type NestPlacement, type Variant } from "@/lib/sheets/nest";
import { anglesFor, ANGLE_STEPS, A4_TEMPLATE, blankSheet, CELL_PX, DEFAULT_SPEC, designBox, DPI, gapCells, SHEET_PX, specProblem, templatePath, withDpi, type SheetSpec } from "@/lib/sheets/sheetLayout";

export type SheetDesign = { name: string; src: string; qty: number };
type Design = SheetDesign & { key: string; img: HTMLImageElement | null; error?: string; sizeCm: string };
/** A ready-to-draw turned sticker: its canvas plus the masks the packer needs. */
type Turned = Variant & { canvas: HTMLCanvasElement };

const CM = 2.54;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load this design."));
    img.src = src; // blob: URLs from this computer, so a canvas can always export them
  });
}

/** Clears near-white pixels connected to the edge (a JPG's paper background). */
function removeWhiteBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  const white = (i: number) => d[i * 4 + 3] > 0 && d[i * 4] > 235 && d[i * 4 + 1] > 235 && d[i * 4 + 2] > 235;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i] || !white(i)) continue;
    seen[i] = 1;
    d[i * 4 + 3] = 0;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  ctx.putImageData(data, 0, 0);
}

/**
 * One sticker at print size: the design at w×h, optionally on a solid white
 * outline b px wide that follows its shape. The outer edge is where the
 * Cricut cuts, so it's made fully opaque (no soft edge to confuse the cut).
 */
function prepare(img: HTMLImageElement, w: number, h: number, b: number, clearWhite: boolean): HTMLCanvasElement {
  const art = document.createElement("canvas");
  art.width = w;
  art.height = h;
  const a = art.getContext("2d")!;
  a.imageSmoothingQuality = "high";
  a.drawImage(img, 0, 0, w, h);
  if (clearWhite) removeWhiteBackground(a, w, h);
  if (b <= 0) return art;

  const out = document.createElement("canvas");
  out.width = w + 2 * b;
  out.height = h + 2 * b;
  const o = out.getContext("2d")!;
  const sil = document.createElement("canvas");
  sil.width = w;
  sil.height = h;
  const s = sil.getContext("2d")!;
  s.drawImage(art, 0, 0);
  s.globalCompositeOperation = "source-in";
  s.fillStyle = "#fff";
  s.fillRect(0, 0, w, h);
  o.drawImage(sil, b, b);
  for (const r of [b / 2, b])
    for (let k = 0; k < 36; k++) {
      const t = (k / 36) * Math.PI * 2;
      o.drawImage(sil, b + r * Math.cos(t), b + r * Math.sin(t));
    }
  const px = o.getImageData(0, 0, out.width, out.height);
  for (let i = 3; i < px.data.length; i += 4) px.data[i] = px.data[i] > 60 ? 255 : 0;
  o.putImageData(px, 0, 0);
  o.drawImage(art, b, b);
  return out;
}

/** The sticker turned by `angle`, on a canvas sized to whole grid cells, with its masks. */
function turn(sticker: HTMLCanvasElement, angle: number, pad: number): Turned {
  const t = (angle * Math.PI) / 180;
  const w = sticker.width;
  const h = sticker.height;
  const rw = Math.ceil((Math.abs(w * Math.cos(t)) + Math.abs(h * Math.sin(t))) / CELL_PX) * CELL_PX;
  const rh = Math.ceil((Math.abs(w * Math.sin(t)) + Math.abs(h * Math.cos(t))) / CELL_PX) * CELL_PX;
  const canvas = document.createElement("canvas");
  canvas.width = rw;
  canvas.height = rh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(rw / 2, rh / 2);
  ctx.rotate(t);
  ctx.drawImage(sticker, -w / 2, -h / 2);
  const shape = maskFromRgba(ctx.getImageData(0, 0, rw, rh).data, rw, rh, CELL_PX);
  return { angle, shape, clearance: dilate(shape, pad), pad, canvas };
}

function drawSheet(canvas: HTMLCanvasElement, placements: NestPlacement[], turned: Map<string, Map<number, Turned>>) {
  canvas.width = SHEET_PX.w;
  canvas.height = SHEET_PX.h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const p of placements) {
    const v = turned.get(p.key)?.get(p.angle);
    if (v) ctx.drawImage(v.canvas, p.x * CELL_PX, p.y * CELL_PX);
  }
}

const num = (v: string) => Number(v.replace(",", ".")) || 0;

export function SheetMaker({ initial = [], title = "cutdesk" }: { initial?: SheetDesign[]; title?: string }) {
  const [designs, setDesigns] = useState<Design[]>(() => initial.map((d, i) => ({ ...d, key: `init-${i}`, img: null, sizeCm: "" })));
  const [sizeCm, setSizeCm] = useState(String(Math.round(DEFAULT_SPEC.sizeIn * CM * 10) / 10));
  const [borderMm, setBorderMm] = useState("0");
  const [gapMm, setGapMm] = useState("3");
  const [angleStep, setAngleStep] = useState<number>(DEFAULT_SPEC.angleStep);
  const [clearWhite, setClearWhite] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<{ key: string; sheets: NestPlacement[][]; tooBig: string[] }>({ key: "", sheets: [], tooBig: [] });
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const turnedRef = useRef(new Map<string, Map<number, Turned>>());

  const spec: SheetSpec = { sizeIn: num(sizeCm) / CM, borderIn: num(borderMm) / 10 / CM, gapIn: num(gapMm) / 10 / CM, angleStep };
  const problem = specProblem(spec);

  // Load each design once.
  useEffect(() => {
    for (const d of designs) {
      if (d.img || d.error) continue;
      loadImage(d.src).then(
        (img) => setDesigns((list) => list.map((x) => (x.key === d.key ? { ...x, img } : x))),
        (err: Error) => setDesigns((list) => list.map((x) => (x.key === d.key ? { ...x, error: err.message } : x))),
      );
    }
  }, [designs]);

  const ready = designs.filter((d) => d.img && d.qty > 0);
  const readyKey = ready.map((d) => `${d.key}:${d.qty}:${d.sizeCm}`).join(",");
  const packKey = `${readyKey}|${sizeCm}|${borderMm}|${gapMm}|${angleStep}|${clearWhite}|${problem}`;
  const busy = result.key !== packKey && ready.length > 0 && !problem;

  /** Turned versions of one design for the current settings. */
  function variantsFor(d: Design): Turned[] {
    const size = (num(d.sizeCm) || num(sizeCm)) / CM;
    const b = Math.round(spec.borderIn * DPI);
    const box = designBox(d.img!.naturalWidth / d.img!.naturalHeight, Math.max(0.1, size - 2 * spec.borderIn));
    const sticker = prepare(d.img!, box.w, box.h, b, clearWhite);
    const pad = gapCells(spec.gapIn);
    return anglesFor(spec.angleStep).map((a) => turn(sticker, a, pad));
  }

  // Pack the sheets. Debounced so typing a quantity doesn't re-pack on every key.
  useEffect(() => {
    const empty = Boolean(problem) || !ready.length;
    const t = setTimeout(() => {
      if (empty) {
        setResult({ key: packKey, sheets: [], tooBig: [] });
        return;
      }
      const turned = new Map<string, Map<number, Turned>>();
      const items: NestItem[] = ready.map((d) => {
        const vs = variantsFor(d);
        turned.set(d.key, new Map(vs.map((v) => [v.angle, v])));
        return { key: d.key, qty: d.qty, variants: vs };
      });
      turnedRef.current = turned;
      setResult({ key: packKey, ...nest(items, blankSheet) });
    }, empty ? 0 : 250);
    return () => clearTimeout(t);
    // packKey captures every input; the functions are rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packKey]);

  // Draw full-size sheets (they're also what gets downloaded).
  useEffect(() => {
    result.sheets.forEach((s, i) => canvases.current[i] && drawSheet(canvases.current[i]!, s, turnedRef.current));
  }, [result]);

  const addFiles = (files: Iterable<File>) =>
    add(
      [...files]
        .filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type))
        .map((f) => ({ name: f.name.replace(/\.[^.]+$/, ""), src: URL.createObjectURL(f), qty: 1 })),
    );
  const add = (list: SheetDesign[]) => setDesigns((d) => [...d, ...list.map((x) => ({ ...x, key: crypto.randomUUID(), img: null, sizeCm: "" }))]);
  const update = (key: string, patch: Partial<Design>) => setDesigns((list) => list.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  /** How many of one design fit on an empty sheet. */
  function fillSheet(d: Design) {
    if (problem || !d.img) return;
    const r = nest([{ key: d.key, qty: 400, variants: variantsFor(d) }], blankSheet);
    if (r.sheets[0]?.length) update(d.key, { qty: r.sheets[0].length });
  }

  async function download(i: number) {
    const canvas = canvases.current[i];
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) return;
    const png = withDpi(new Uint8Array(await blob.arrayBuffer()), DPI);
    const url = URL.createObjectURL(new Blob([png as BlobPart], { type: "image/png" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-sheet-${i + 1}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const total = result.sheets.reduce((n, s) => n + s.length, 0);
  const tooBigNames = designs.filter((d) => result.tooBig.includes(d.key)).map((d) => d.name);
  const lbl = "mb-1 block text-xs text-ink-faint";
  const { widthIn: W, heightIn: H } = A4_TEMPLATE;

  return (
    <div className="grid gap-8 xl:grid-cols-[24rem_1fr]">
      <div className="space-y-6">
        <section
          className={`space-y-3 rounded-2xl border p-5 ${dragging ? "border-mat-deep bg-mat/20" : "border-line"}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <h2 className="font-medium">Designs</h2>
          {designs.length === 0 && <p className="text-sm text-ink-soft">Drop your outlined sticker PNGs here, or add them from your computer.</p>}
          <ul className="space-y-2">
            {designs.map((d) => (
              <li key={d.key} className="flex items-center gap-2">
                <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-sunken p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview, nothing to optimise */}
                  {d.img && <img src={d.img.src} alt="" className="max-h-full w-auto object-contain" />}
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate">{d.name}</p>
                  {d.error ? (
                    <p className="text-xs text-blade">{d.error}</p>
                  ) : !d.img ? (
                    <p className="text-xs text-ink-soft">Loading…</p>
                  ) : (
                    <button type="button" className="text-xs text-ink-soft underline underline-offset-2 hover:text-score" onClick={() => fillSheet(d)}>
                      Fill a sheet
                    </button>
                  )}
                </div>
                <label className="sr-only" htmlFor={`size-${d.key}`}>
                  Size of {d.name} in cm
                </label>
                <input
                  id={`size-${d.key}`}
                  value={d.sizeCm}
                  onChange={(e) => update(d.key, { sizeCm: e.target.value.replace(/[^\d.,]/g, "").slice(0, 5) })}
                  placeholder={`${sizeCm} cm`}
                  title="Size in cm (blank = the size below)"
                  inputMode="decimal"
                  className="field w-16 !px-2 !py-1.5 text-center text-xs tabular-nums"
                />
                <label className="sr-only" htmlFor={`qty-${d.key}`}>
                  How many of {d.name}
                </label>
                <input
                  id={`qty-${d.key}`}
                  value={d.qty}
                  onChange={(e) => update(d.key, { qty: Math.min(999, Number(e.target.value.replace(/\D/g, "")) || 0) })}
                  inputMode="numeric"
                  className="field w-14 !px-2 !py-1.5 text-center text-sm tabular-nums"
                />
                <button type="button" aria-label={`Remove ${d.name}`} className="text-ink-soft hover:text-blade" onClick={() => setDesigns((l) => l.filter((x) => x.key !== d.key))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          {designs.length > 0 && <p className="text-xs text-ink-soft">Left box: size in cm for that design (blank = the size below). Right box: how many.</p>}
          <div className="space-y-2 border-t border-line pt-3">
            <label className="btn btn-ghost w-full cursor-pointer justify-center !py-2 text-sm">
              Add files from this computer
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="sr-only"
                onChange={(e) => {
                  addFiles(e.target.files ?? []);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="text-xs text-ink-soft">Files from your computer stay on it; nothing is uploaded.</p>
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-line p-5">
          <h2 className="font-medium">Layout</h2>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className={lbl}>Sticker size (cm, long side)</span>
              <input value={sizeCm} onChange={(e) => setSizeCm(e.target.value)} inputMode="decimal" className="field !py-2 text-sm tabular-nums" />
            </label>
            <label className="block">
              <span className={lbl}>Gap (mm)</span>
              <input value={gapMm} onChange={(e) => setGapMm(e.target.value)} inputMode="decimal" className="field !py-2 text-sm tabular-nums" />
            </label>
            <label className="block">
              <span className={lbl}>Add outline (mm)</span>
              <input value={borderMm} onChange={(e) => setBorderMm(e.target.value)} inputMode="decimal" className="field !py-2 text-sm tabular-nums" />
            </label>
          </div>
          <label className="block">
            <span className={lbl}>Turn stickers to fit more</span>
            <select value={angleStep} onChange={(e) => setAngleStep(Number(e.target.value))} className="field !py-2 text-sm">
              {ANGLE_STEPS.map((a) => (
                <option key={a.step} value={a.step}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-ink-soft">
            Your files already have their cut outline? Keep &ldquo;Add outline&rdquo; at 0. Stickers are packed by their real shape, never overlap, keep the gap
            from each other and the edge, and stay out of the template&apos;s corners. Keep the gap at 3 mm or more so the blade has room.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={clearWhite} onChange={(e) => setClearWhite(e.target.checked)} className="mt-0.5 size-4 accent-mat-deep" />
            <span>
              Remove white backgrounds
              <span className="block text-xs text-ink-soft">For JPGs on white: the cut then follows the design instead of a square.</span>
            </span>
          </label>
          {problem && (
            <p className="text-sm text-blade" role="alert">
              {problem}
            </p>
          )}
        </section>

        <section className="space-y-2 rounded-2xl border border-line p-5 text-sm text-ink-soft">
          <h2 className="font-medium text-ink">In Cricut Design Space</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Upload → Upload image → pick the downloaded sheet PNG.</li>
            <li>Choose Complex, keep the background as it is (already transparent), then save it as a Print Then Cut image.</li>
            <li>
              Add it to the canvas and set its size to <strong>{W} × {H} in</strong> (width {W} in with the lock on). It fills the A4 print area exactly, so nothing needs
              lining up.
            </li>
            <li>Make It → paper size A4 → print, then load the sheet and cut. Each sticker&apos;s outer edge is a cut line.</li>
          </ol>
        </section>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-soft" data-testid="sheet-summary">
            {busy ? "Arranging…" : `${total} sticker${total === 1 ? "" : "s"} on ${result.sheets.length} sheet${result.sheets.length === 1 ? "" : "s"}`}
          </p>
          {result.sheets.length > 1 && !busy && (
            <button type="button" className="btn btn-ghost !py-2 text-sm" onClick={() => result.sheets.forEach((_, i) => setTimeout(() => void download(i), i * 400))}>
              Download all
            </button>
          )}
        </div>
        {tooBigNames.length > 0 && (
          <p className="text-sm text-blade" role="alert">
            Too big for the sheet at this size: {tooBigNames.join(", ")}. Make them smaller.
          </p>
        )}
        <ul className="grid gap-6 sm:grid-cols-2">
          {result.sheets.map((s, i) => (
            <li key={i} className="space-y-2">
              <div className="rounded-xl bg-[repeating-conic-gradient(#2a2a28_0_25%,#222220_0_50%)] bg-[length:16px_16px] p-2">
                <div className="relative">
                  {/* The template shape, for the preview only. It isn't in the downloaded PNG. */}
                  <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full" aria-hidden="true">
                    <path d={templatePath()} fill="#c9a6ff" fillOpacity="0.18" stroke="#c9a6ff" strokeWidth="0.02" />
                  </svg>
                  <canvas
                    ref={(el) => {
                      canvases.current[i] = el;
                    }}
                    className="relative block h-auto w-full"
                    aria-label={`Sheet ${i + 1} preview`}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-soft">
                  Sheet {i + 1}: {s.length} stickers
                </span>
                <button type="button" className="btn btn-primary !py-1.5 text-sm" onClick={() => void download(i)} disabled={busy}>
                  Download PNG
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-soft">The purple shape is Cricut&apos;s A4 print area ({W} × {H} in). The download has no background: only the stickers.</p>
      </div>
    </div>
  );
}
