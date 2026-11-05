"use client";

import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";
import { Tip } from "./Tooltip";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon;
  /** Accessible name and tooltip text. */
  label: string;
  shortcut?: string;
  /** Marks a toggle as on. */
  pressed?: boolean;
  size?: "sm" | "md";
  tipSide?: "top" | "right" | "bottom" | "left";
}

export function IconButton({ icon: Icon, label, shortcut, pressed, size = "md", tipSide, className, ...rest }: Props) {
  return (
    <Tip label={label} shortcut={shortcut} side={tipSide}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        className={cn(
          "grid shrink-0 place-items-center rounded-control transition-colors disabled:cursor-not-allowed disabled:opacity-40",
          size === "md" ? "size-9" : "size-7",
          pressed ? "bg-ink text-white" : "text-ink hover:bg-sunken active:bg-line",
          className,
        )}
        {...rest}
      >
        <Icon className={size === "md" ? "size-[18px]" : "size-4"} strokeWidth={1.9} aria-hidden="true" />
      </button>
    </Tip>
  );
}
