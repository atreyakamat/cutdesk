"use client";

import { useId, useState } from "react";
import { cn } from "./cn";

interface Props {
  /** Short visible name, such as "X" or "Radius". */
  label: string;
  /** Longer accessible name. Defaults to `label`. */
  ariaLabel?: string;
  value: number | null;
  onCommit: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Decimal places shown. */
  precision?: number;
  unit?: string;
  disabled?: boolean;
  className?: string;
}

function show(v: number | null, precision: number): string {
  return v === null || !Number.isFinite(v) ? "" : String(Number(v.toFixed(precision)));
}

/**
 * A number input that commits on Enter or blur, steps with the arrow keys
 * (hold Shift for ×10), and reverts when the text isn't a number.
 */
export function NumberField({ label, ariaLabel, value, onCommit, step = 1, min, max, precision = 1, unit, disabled, className }: Props) {
  const id = useId();
  const [text, setText] = useState(() => show(value, precision));
  const [focused, setFocused] = useState(false);

  // Follow outside changes (drag on canvas, undo) unless the user is typing.
  const shown = show(value, precision);
  const [lastShown, setLastShown] = useState(shown);
  if (shown !== lastShown) {
    setLastShown(shown);
    if (!focused) setText(shown);
  }

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

  const commit = (raw: string) => {
    const n = Number(raw.replace(",", ".").trim());
    if (raw.trim() === "" || !Number.isFinite(n)) {
      setText(show(value, precision));
      return;
    }
    const next = clamp(n);
    setText(show(next, precision));
    if (value === null || Math.abs(next - value) > 1e-9) onCommit(next);
  };

  return (
    <label
      htmlFor={id}
      className={cn(
        "flex h-8 min-w-0 items-center gap-1.5 rounded-control border border-line bg-white px-2 text-sm focus-within:border-ink focus-within:ring-2 focus-within:ring-focus/30",
        disabled && "opacity-45",
        className,
      )}
    >
      <span className="w-auto shrink-0 text-xs font-medium text-ink-soft">{label}</span>
      <input
        id={id}
        aria-label={ariaLabel ?? label}
        inputMode="decimal"
        disabled={disabled}
        value={text}
        placeholder={value === null ? "–" : undefined}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={(e) => {
          setFocused(false);
          commit(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit(e.currentTarget.value);
            e.currentTarget.select();
          } else if (e.key === "Escape") {
            setText(show(value, precision));
            e.currentTarget.blur();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const base = Number(text.replace(",", "."));
            const from = Number.isFinite(base) ? base : (value ?? 0);
            const delta = (e.shiftKey ? step * 10 : step) * (e.key === "ArrowUp" ? 1 : -1);
            const next = clamp(from + delta);
            setText(show(next, precision));
            onCommit(next);
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-right tabular-nums outline-none"
      />
      {unit ? <span className="shrink-0 text-xs text-ink-faint">{unit}</span> : null}
    </label>
  );
}
