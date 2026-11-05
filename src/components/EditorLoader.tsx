"use client";

import dynamic from "next/dynamic";
import { Logo } from "./Logo";

/**
 * The editor draws on a canvas and reads files from the browser, so it only
 * ever renders on the client. `ssr: false` is only allowed in a Client
 * Component, which is why this wrapper exists.
 */
const Editor = dynamic(() => import("./Editor"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-bench" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-ink-soft">
        <Logo className="size-7" />
        <span className="font-display text-lg font-semibold text-ink">CutDesk</span>
        <span>Laying out the mat…</span>
      </div>
    </div>
  ),
});

export function EditorLoader() {
  return <Editor />;
}
