"use client";

import { Tooltip as T } from "radix-ui";
import type { ReactElement, ReactNode } from "react";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <T.Provider delayDuration={350} skipDelayDuration={150}>{children}</T.Provider>;
}

interface Props {
  label: string;
  /** Keyboard shortcut shown beside the label, e.g. "V" or "Ctrl Z". */
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactElement;
}

export function Tip({ label, shortcut, side = "bottom", children }: Props) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={8}
          className="pop-in z-[60] flex items-center gap-2 rounded-control bg-ink px-2.5 py-1.5 text-xs font-medium text-white shadow-pop"
        >
          {label}
          {shortcut ? <kbd className="rounded bg-white/15 px-1.5 py-0.5 font-sans text-[11px] text-white/80">{shortcut}</kbd> : null}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
