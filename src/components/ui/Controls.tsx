"use client";

import { ChevronDown } from "lucide-react";
import { Switch as S } from "radix-ui";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "./cn";

/** A titled block in a side panel. */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-line px-4 py-3", className)}>
      <div className="mb-2.5 flex h-6 items-center justify-between">
        <h2 className="font-display text-[15px] font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-8 items-center justify-between gap-3", className)}>
      <span className="text-sm text-ink-soft">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  "aria-label": string;
}

/** A native select with the app's look. Native keeps keyboard and screen reader behaviour free. */
export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <span className="relative inline-flex min-w-0">
      <select
        className={cn(
          "h-8 w-full min-w-0 appearance-none truncate rounded-control border border-line bg-raised py-0 pl-2.5 pr-7 text-sm text-ink hover:border-line-strong focus:border-ink disabled:opacity-45",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
    </span>
  );
}

export function Toggle({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <S.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className="relative h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-ink"
    >
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  );
}

export function Button({
  variant = "secondary",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-control px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-ink text-on-ink hover:opacity-90 active:opacity-80",
        variant === "secondary" && "border border-line bg-raised text-ink hover:border-line-strong hover:bg-sunken",
        variant === "ghost" && "text-ink hover:bg-sunken",
        variant === "danger" && "border border-line bg-raised text-blade hover:border-blade/50 hover:bg-blade/5",
        className,
      )}
      {...rest}
    />
  );
}
