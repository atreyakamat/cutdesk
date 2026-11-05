"use client";

import { Eye, EyeOff, GripVertical, Lock, Plus, Trash2, Unlock } from "lucide-react";
import { Reorder, useDragControls } from "framer-motion";
import { Popover } from "radix-ui";
import { useMemo } from "react";
import { LAYER_COLORS, OPERATION_LABEL } from "@/lib/doc/defaults";
import { OPERATIONS, type Layer, type Operation } from "@/lib/doc/types";
import { useEditor } from "@/store/editorStore";
import { Section, Select } from "./ui/Controls";
import { IconButton } from "./ui/IconButton";
import { cn } from "./ui/cn";

function LayerRow({ layer, count }: { layer: Layer; count: number }) {
  const controls = useDragControls();
  const active = useEditor((s) => s.activeLayerId === layer.id);
  const setActive = useEditor((s) => s.setActiveLayer);
  const update = useEditor((s) => s.updateLayer);
  const remove = useEditor((s) => s.removeLayer);
  const layerCount = useEditor((s) => s.doc.layers.length);

  return (
    <Reorder.Item
      value={layer.id}
      dragListener={false}
      dragControls={controls}
      className={cn(
        "list-none rounded-control border bg-white",
        active ? "border-ink" : "border-line hover:border-line-strong",
      )}
    >
      <div className="flex items-center gap-1 p-1.5" onPointerDown={() => setActive(layer.id)}>
        <button
          type="button"
          aria-label={`Drag to reorder ${layer.name}`}
          onPointerDown={(e) => controls.start(e)}
          className="grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded text-ink-faint hover:text-ink"
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>

        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label={`Colour of ${layer.name}`}
              className="size-5 shrink-0 rounded-full border border-black/20"
              style={{ background: layer.color }}
            />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content sideOffset={6} className="pop-in z-50 grid grid-cols-4 gap-2 rounded-pop bg-panel p-3 shadow-pop">
              {LAYER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use colour ${c}`}
                  aria-pressed={layer.color === c}
                  onClick={() => update(layer.id, { color: c })}
                  className={cn("size-7 rounded-full border border-black/20", layer.color === c && "ring-2 ring-ink ring-offset-2")}
                  style={{ background: c }}
                />
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <input
          aria-label="Layer name"
          value={layer.name}
          maxLength={40}
          onChange={(e) => update(layer.id, { name: e.target.value })}
          className="h-7 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 text-sm font-medium hover:border-line focus:border-ink"
        />
        <span className="text-xs tabular-nums text-ink-faint" aria-label={`${count} objects`}>
          {count}
        </span>
        <IconButton
          size="sm"
          icon={layer.visible ? Eye : EyeOff}
          label={layer.visible ? "Hide layer" : "Show layer"}
          onClick={() => update(layer.id, { visible: !layer.visible })}
        />
        <IconButton
          size="sm"
          icon={layer.locked ? Lock : Unlock}
          label={layer.locked ? "Unlock layer" : "Lock layer"}
          onClick={() => update(layer.id, { locked: !layer.locked })}
        />
      </div>

      {active && (
        <div className="flex items-center gap-2 border-t border-line px-2 py-1.5">
          <Select
            aria-label={`What ${layer.name} does`}
            value={layer.operation}
            onChange={(e) => update(layer.id, { operation: e.target.value as Operation })}
            className="flex-1"
          >
            {OPERATIONS.map((op) => (
              <option key={op} value={op}>
                {OPERATION_LABEL[op]}
              </option>
            ))}
          </Select>
          <IconButton
            size="sm"
            icon={Trash2}
            label="Delete layer"
            disabled={layerCount <= 1}
            onClick={() => {
              if (count === 0 || window.confirm(`Delete "${layer.name}" and its ${count} objects?`)) remove(layer.id);
            }}
          />
        </div>
      )}
    </Reorder.Item>
  );
}

export function LayersPanel() {
  const layers = useEditor((s) => s.doc.layers);
  const objects = useEditor((s) => s.doc.objects);
  const reorder = useEditor((s) => s.reorderLayers);
  const addLayer = useEditor((s) => s.addLayer);

  const topFirst = useMemo(() => [...layers].reverse(), [layers]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of objects) m.set(o.layerId, (m.get(o.layerId) ?? 0) + 1);
    return m;
  }, [objects]);
  const byId = useMemo(() => new Map(layers.map((l) => [l.id, l] as const)), [layers]);

  return (
    <Section
      title="Layers"
      action={
        <IconButton size="sm" icon={Plus} label="Add a cut layer" onClick={() => addLayer("cut")} />
      }
    >
      <Reorder.Group axis="y" values={topFirst.map((l) => l.id)} onReorder={reorder} className="m-0 flex flex-col gap-1.5 p-0">
        {topFirst.map((l) => (
          <LayerRow key={l.id} layer={byId.get(l.id) ?? l} count={counts.get(l.id) ?? 0} />
        ))}
      </Reorder.Group>
    </Section>
  );
}
