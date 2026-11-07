"use client";

import { Check, TriangleAlert } from "lucide-react";
import { saveStatusLabel } from "@/lib/ui/saveStatus";
import { useEditor } from "@/store/editorStore";

/** Subtle autosave status: "Saving…" → "Saved", or an error prompt. */
export function SaveIndicator() {
  const status = useEditor((s) => s.saveStatus);
  const { text, tone } = saveStatusLabel(status);
  if (!text) return null;

  return (
    <span
      role="status"
      aria-live="polite"
      className={`hidden items-center gap-1 text-xs sm:inline-flex ${
        tone === "error" ? "text-blade" : "text-ink-faint"
      }`}
    >
      {status === "saved" && <Check className="size-3.5" aria-hidden="true" />}
      {status === "saving" && <span className="size-1.5 animate-pulse rounded-full bg-ink-faint" aria-hidden="true" />}
      {status === "error" && <TriangleAlert className="size-3.5" aria-hidden="true" />}
      {text}
    </span>
  );
}
