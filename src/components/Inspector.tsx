"use client";

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  EyeOff,
  Group,
  Link2,
  Lock,
  Pipette,
  Plus,
  Trash2,
  Ungroup,
  Unlink2,
  Unlock,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { buildCutPlan } from "@/lib/doc/cutPlan";
import { LAYER_COLORS } from "@/lib/doc/defaults";
import { bboxSize, unionBBox, worldAABB } from "@/lib/doc/geometry";
import { MAT_PRESETS, MAX_MAT_MM, MIN_MAT_MM } from "@/lib/doc/mats";
import { fromMm, formatLength, toMm, unitPrecision } from "@/lib/doc/units";
import { FONTS } from "@/lib/text/fonts";
import { deleteStylePreset, listStylePresets, saveStylePreset } from "@/lib/ui/stylePresets";
import type { FontId, MatPresetId, Unit } from "@/lib/doc/types";
import { selectedObjectsOf, useEditor } from "@/store/editorStore";
import { Row, Section, Select } from "./ui/Controls";
import { IconButton } from "./ui/IconButton";
import { NumberField } from "./ui/NumberField";
import { cn } from "./ui/cn";

function MatSection() {
  const mat = useEditor((s) => s.doc.mat);
  const unit = useEditor((s) => s.doc.unit);
  const setMat = useEditor((s) => s.setMat);
  const setUnit = useEditor((s) => s.setUnit);
  const prec = unitPrecision(unit);

  return (
    <Section title="Mat">
      <div className="flex flex-col gap-2">
        <Select
          aria-label="Mat size"
          value={mat.preset}
          onChange={(e) => {
            const v = e.target.value as MatPresetId;
            setMat(v === "custom" ? { preset: "custom" } : { preset: v });
          }}
        >
          {MAT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom size</option>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="W"
            ariaLabel="Mat width"
            unit={unit}
            precision={prec}
            min={fromMm(MIN_MAT_MM, unit)}
            max={fromMm(MAX_MAT_MM, unit)}
            value={fromMm(mat.width, unit)}
            onCommit={(v) => setMat({ preset: "custom", width: toMm(v, unit) })}
          />
          <NumberField
            label="H"
            ariaLabel="Mat height"
            unit={unit}
            precision={prec}
            min={fromMm(MIN_MAT_MM, unit)}
            max={fromMm(MAX_MAT_MM, unit)}
            value={fromMm(mat.height, unit)}
            onCommit={(v) => setMat({ preset: "custom", height: toMm(v, unit) })}
          />
        </div>
        <Row label="Units">
          <Select aria-label="Units" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            <option value="mm">Millimetres</option>
            <option value="in">Inches</option>
          </Select>
        </Row>
      </div>
    </Section>
  );
}

function SummarySection() {
  const doc = useEditor((s) => s.doc);
  const plan = useMemo(() => buildCutPlan(doc), [doc]);
  const { cut, score, draw } = plan.lengthByOperation;
  const rows: Array<[string, number]> = [
    ["Cut", cut],
    ["Score", score],
    ["Draw", draw],
  ];
  return (
    <Section title="Job summary">
      {plan.passes.length === 0 ? (
        <p className="text-sm text-ink-soft">Put shapes on a cut, score or draw layer and the machine path shows up here.</p>
      ) : (
        <dl className="flex flex-col gap-1 text-sm">
          {rows
            .filter(([, v]) => v > 0)
            .map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-ink-soft">{k} length</dt>
                <dd className="tabular-nums">{formatLength(v, doc.unit)}</dd>
              </div>
            ))}
          <div className="flex justify-between">
            <dt className="text-ink-soft">Passes</dt>
            <dd className="tabular-nums">{plan.passes.length}</dd>
          </div>
        </dl>
      )}
    </Section>
  );
}

const ALIGN = [
  { mode: "left", label: "Align left", icon: AlignStartVertical },
  { mode: "hcenter", label: "Centre horizontally", icon: AlignCenterVertical },
  { mode: "right", label: "Align right", icon: AlignEndVertical },
  { mode: "top", label: "Align top", icon: AlignStartHorizontal },
  { mode: "vmiddle", label: "Centre vertically", icon: AlignCenterHorizontal },
  { mode: "bottom", label: "Align bottom", icon: AlignEndHorizontal },
] as const;

function TextFields({ id }: { id: string }) {
  const geo = useEditor((s) => {
    const o = s.doc.objects.find((x) => x.id === id);
    return o?.geo.kind === "text" ? o.geo : null;
  });
  const setTextProps = useEditor((s) => s.setTextProps);
  const tick = useEditor((s) => s.textFocusTick);
  const unit = useEditor((s) => s.doc.unit);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    if (tick > 0) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [tick]);

  if (!geo) return null;
  const prec = unitPrecision(unit);
  return (
    <Section title="Text">
      <div className="flex flex-col gap-2">
        <textarea
          ref={ref}
          aria-label="Text content"
          rows={2}
          value={draft ?? geo.text}
          onChange={(e) => {
            setDraft(e.target.value);
            void setTextProps(id, { text: e.target.value }).then(() => undefined);
          }}
          onBlur={() => setDraft(null)}
          className="w-full resize-none rounded-control border border-line bg-raised px-2.5 py-1.5 text-sm hover:border-line-strong focus:border-ink"
        />
        <Select
          aria-label="Font"
          value={geo.fontId}
          onChange={(e) => void setTextProps(id, { fontId: e.target.value as FontId })}
        >
          {FONTS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Size"
            unit={unit}
            precision={prec}
            min={fromMm(2, unit)}
            max={fromMm(600, unit)}
            value={fromMm(geo.size, unit)}
            onCommit={(v) => void setTextProps(id, { size: toMm(v, unit) })}
          />
          <NumberField
            label="Spacing"
            unit={unit}
            precision={prec}
            step={unit === "mm" ? 0.5 : 0.02}
            value={fromMm(geo.letterSpacing, unit)}
            onCommit={(v) => void setTextProps(id, { letterSpacing: toMm(v, unit) })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <span className="w-14">Curve</span>
          <input
            type="range"
            min={-180}
            max={180}
            aria-label="Curve text along an arc"
            value={geo.arc ?? 0}
            onChange={(e) => void setTextProps(id, { arc: Number(e.target.value) })}
            className="flex-1"
          />
          <span className="w-9 text-right tabular-nums">{Math.round(geo.arc ?? 0)}°</span>
        </label>
      </div>
    </Section>
  );
}

function SelectionSection() {
  const objs = useEditor(useShallow((s) => selectedObjectsOf(s)));
  const layers = useEditor((s) => s.doc.layers);
  const unit = useEditor((s) => s.doc.unit);
  const store = useEditor.getState;
  const [lock, setLock] = useState(true);
  const [outlineMm, setOutlineMm] = useState(3);
  const [presetVer, setPresetVer] = useState(0);
  const presets = useMemo(() => {
    void presetVer; // re-read local storage after a save/delete
    return listStylePresets();
  }, [presetVer]);

  const box = useMemo(() => unionBBox(objs.map(worldAABB)), [objs]);
  if (!box) return null;
  const size = bboxSize(box);
  const single = objs.length === 1 ? objs[0] : null;
  const prec = unitPrecision(unit);
  const layerId = objs.every((o) => o.layerId === objs[0].layerId) ? objs[0].layerId : "";
  const ids = objs.map((o) => o.id);
  const image = single?.geo.kind === "image";
  const fillable = objs.some((o) => o.geo.kind !== "image");
  const fill = single?.style?.fill;
  const opacityPct = Math.round((single?.style?.opacity ?? objs[0].style?.opacity ?? 1) * 100);
  const canGroup = objs.length >= 2;
  const canUngroup = objs.some((o) => !!o.groupId);
  const shapeCount = objs.filter((o) => o.geo.kind !== "image").length;
  const hasPathLike = objs.some((o) => o.geo.kind === "path" || o.geo.kind === "text");
  const allLocked = objs.every((o) => o.locked);

  const EyeDropperCtor =
    typeof window !== "undefined"
      ? (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
      : undefined;
  const pickColor = async () => {
    if (!EyeDropperCtor) return;
    try {
      const { sRGBHex } = await new EyeDropperCtor().open();
      if (/^#[0-9a-fA-F]{6}$/.test(sRGBHex)) store().setStyle(ids, { fill: sRGBHex });
    } catch {
      /* the picker was dismissed */
    }
  };
  const savePreset = () => {
    if (fill && saveStylePreset(fill, opacityPct / 100)) setPresetVer((v) => v + 1);
  };

  return (
    <>
      <Section title={single ? single.name : `${objs.length} objects`}>
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X" unit={unit} precision={prec} value={fromMm(box.minX, unit)} onCommit={(v) => store().setPosition(toMm(v, unit))} />
            <NumberField label="Y" unit={unit} precision={prec} value={fromMm(box.minY, unit)} onCommit={(v) => store().setPosition(undefined, toMm(v, unit))} />
            <NumberField
              label="W"
              unit={unit}
              precision={prec}
              min={fromMm(0.1, unit)}
              disabled={!single}
              value={fromMm(size.width, unit)}
              onCommit={(v) => store().setSize({ width: toMm(v, unit) }, lock)}
            />
            <NumberField
              label="H"
              unit={unit}
              precision={prec}
              min={fromMm(0.1, unit)}
              disabled={!single}
              value={fromMm(size.height, unit)}
              onCommit={(v) => store().setSize({ height: toMm(v, unit) }, lock)}
            />
          </div>
          <div className="flex items-center gap-2">
            <NumberField
              className="flex-1"
              label="Rotate"
              unit="°"
              precision={1}
              value={single ? single.rotation : null}
              disabled={!single}
              onCommit={(v) => store().setRotation(v)}
            />
            <IconButton
              size="sm"
              icon={lock ? Link2 : Unlink2}
              label={lock ? "Unlock proportions" : "Lock proportions"}
              pressed={lock}
              onClick={() => setLock(!lock)}
            />
          </div>
          {single?.geo.kind === "rect" && (
            <NumberField
              label="Corner radius"
              unit={unit}
              precision={prec}
              min={0}
              value={fromMm(single.geo.cornerRadius, unit)}
              onCommit={(v) => store().setRectRadius(toMm(v, unit))}
            />
          )}
        </div>
      </Section>

      {fillable && (
        <Section title="Fill">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                aria-label="No fill"
                title="No fill"
                onClick={() => store().setStyle(ids, { fill: undefined })}
                className={cn("grid size-6 place-items-center rounded-full border", !fill ? "border-ink" : "border-line")}
              >
                <span className="block h-px w-4 -rotate-45 bg-blade" />
              </button>
              {LAYER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Fill ${c}`}
                  onClick={() => store().setStyle(ids, { fill: c })}
                  style={{ background: c }}
                  className={cn(
                    "size-6 rounded-full border",
                    fill?.toLowerCase() === c.toLowerCase() ? "border-ink ring-2 ring-ink/30" : "border-line",
                  )}
                />
              ))}
              <label className="relative size-6 overflow-hidden rounded-full border border-line" title="Custom colour">
                <input
                  type="color"
                  aria-label="Custom fill colour"
                  value={fill ?? "#000000"}
                  onChange={(e) => store().setStyle(ids, { fill: e.target.value })}
                  className="absolute -inset-1 cursor-pointer"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <span className="w-14">Opacity</span>
              <input
                type="range"
                min={0}
                max={100}
                aria-label="Opacity"
                value={opacityPct}
                onChange={(e) => store().setStyle(ids, { opacity: Number(e.target.value) / 100 })}
                className="flex-1"
              />
              <span className="w-9 text-right tabular-nums">{opacityPct}%</span>
            </label>

            <div className="flex items-center gap-2">
              {EyeDropperCtor && (
                <button
                  type="button"
                  onClick={() => void pickColor()}
                  className="inline-flex h-7 items-center gap-1 rounded-control border border-line bg-raised px-2 text-xs hover:bg-sunken"
                >
                  <Pipette className="size-3.5" aria-hidden="true" />
                  Pick
                </button>
              )}
              <button
                type="button"
                onClick={savePreset}
                disabled={!fill}
                className="inline-flex h-7 items-center gap-1 rounded-control border border-line bg-raised px-2 text-xs hover:bg-sunken disabled:opacity-40"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Save style
              </button>
            </div>

            {presets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <span key={p.id} className="group relative inline-block">
                    <button
                      type="button"
                      aria-label={`Apply fill ${p.fill}`}
                      title={p.fill}
                      onClick={() => store().setStyle(ids, { fill: p.fill, opacity: p.opacity })}
                      style={{ backgroundColor: p.fill, opacity: p.opacity }}
                      className="size-6 rounded-full border border-line"
                    />
                    <button
                      type="button"
                      aria-label="Delete preset"
                      onClick={() => {
                        deleteStylePreset(p.id);
                        setPresetVer((v) => v + 1);
                      }}
                      className="absolute -right-1 -top-1 hidden size-3.5 place-items-center rounded-full bg-ink text-[9px] leading-none text-on-ink group-hover:grid"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      <TextFields id={single?.geo.kind === "text" ? single.id : ""} />

      <Section title="Arrange">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-0.5">
            {ALIGN.map((a) => (
              <IconButton key={a.mode} size="sm" icon={a.icon} label={a.label} onClick={() => store().align(a.mode)} />
            ))}
            <IconButton
              size="sm"
              icon={AlignHorizontalDistributeCenter}
              label="Distribute horizontally"
              disabled={objs.length < 3}
              onClick={() => store().distribute("h")}
            />
            <IconButton
              size="sm"
              icon={AlignVerticalDistributeCenter}
              label="Distribute vertically"
              disabled={objs.length < 3}
              onClick={() => store().distribute("v")}
            />
          </div>
          <div className="flex flex-wrap gap-0.5">
            <IconButton size="sm" icon={FlipHorizontal2} label="Flip horizontally" onClick={() => store().flip("x")} />
            <IconButton size="sm" icon={FlipVertical2} label="Flip vertically" onClick={() => store().flip("y")} />
            <IconButton size="sm" icon={ArrowUpToLine} label="Bring to front" onClick={() => store().restack("front")} />
            <IconButton size="sm" icon={ChevronUp} label="Bring forward" onClick={() => store().restack("forward")} />
            <IconButton size="sm" icon={ChevronDown} label="Send backward" onClick={() => store().restack("backward")} />
            <IconButton size="sm" icon={ArrowDownToLine} label="Send to back" onClick={() => store().restack("back")} />
            <IconButton size="sm" icon={Group} label="Group" shortcut="Ctrl G" disabled={!canGroup} onClick={() => store().group()} />
            <IconButton size="sm" icon={Ungroup} label="Ungroup" shortcut="Ctrl Shift G" disabled={!canUngroup} onClick={() => store().ungroup()} />
            <IconButton
              size="sm"
              icon={allLocked ? Unlock : Lock}
              label={allLocked ? "Unlock" : "Lock"}
              pressed={allLocked}
              onClick={() => store().setObjectLocked(ids, !allLocked)}
            />
            <IconButton size="sm" icon={EyeOff} label="Hide" onClick={() => store().setObjectHidden(ids, true)} />
          </div>
          {objs.length >= 2 && (
            <button
              type="button"
              onClick={() => store().autoNest()}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-control border border-line bg-raised text-sm font-medium hover:bg-sunken"
            >
              Arrange to fit
            </button>
          )}
          {shapeCount >= 2 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-ink-faint">Combine</span>
              <div className="grid grid-cols-2 gap-1">
                {([
                  ["union", "Union"],
                  ["difference", "Subtract"],
                  ["intersection", "Intersect"],
                  ["xor", "Exclude"],
                ] as const).map(([op, label]) => (
                  <button
                    key={op}
                    type="button"
                    onClick={() => store().combineSelection(op)}
                    className="h-7 rounded-control border border-line bg-raised text-xs font-medium hover:bg-sunken"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {shapeCount >= 1 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-end gap-2">
                <NumberField
                  className="flex-1"
                  label="Outline"
                  ariaLabel="Outline distance"
                  unit={unit}
                  precision={prec}
                  min={0}
                  max={fromMm(50, unit)}
                  step={unit === "mm" ? 0.5 : 0.02}
                  value={fromMm(outlineMm, unit)}
                  onCommit={(v) => setOutlineMm(toMm(v, unit))}
                />
                <button
                  type="button"
                  onClick={() => store().outlineSelection(outlineMm)}
                  className="inline-flex h-8 items-center justify-center rounded-control border border-line bg-raised px-3 text-sm font-medium hover:bg-sunken"
                >
                  Add
                </button>
              </div>
              {hasPathLike && (
                <button
                  type="button"
                  onClick={() => store().contourSelection()}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-control border border-line bg-raised text-sm font-medium hover:bg-sunken"
                >
                  Remove holes
                </button>
              )}
            </div>
          )}

          <Row label="Layer">
            <Select
              aria-label="Move to layer"
              value={layerId}
              onChange={(e) => store().moveToLayer(ids, e.target.value)}
              className="w-40"
            >
              {layerId === "" && <option value="">Mixed</option>}
              {[...layers].reverse().map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Row>
          {image && <p className="text-xs text-ink-soft">Reference artwork is for tracing and placement. It is never cut.</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => store().duplicateObjects(ids)}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-control border border-line bg-raised text-sm font-medium hover:bg-sunken"
            >
              <Copy className="size-3.5" aria-hidden="true" />
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => store().removeObjects(ids)}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-control border border-line bg-raised text-sm font-medium text-blade hover:bg-blade/5"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Delete
            </button>
          </div>
        </div>
      </Section>
    </>
  );
}

export function Inspector() {
  const hasSelection = useEditor((s) => s.selection.length > 0);
  return hasSelection ? (
    <SelectionSection />
  ) : (
    <>
      <MatSection />
      <SummarySection />
    </>
  );
}
