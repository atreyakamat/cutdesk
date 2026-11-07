"use client";

import { CircleAlert, Info, X } from "lucide-react";
import { useEffect } from "react";
import { useEditor } from "@/store/editorStore";
import { cn } from "./ui/cn";

/** One message at a time. Errors stay a little longer. */
export function NoticeToast() {
  const notice = useEditor((s) => s.notice);
  const dismiss = useEditor((s) => s.dismissNotice);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismiss, notice.kind === "error" ? 9000 : 4500);
    return () => clearTimeout(t);
  }, [notice, dismiss]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center px-4">
      {notice && (
        <div
          key={notice.id}
          role={notice.kind === "error" ? "alert" : "status"}
          className={cn(
            "pop-in pointer-events-auto flex max-w-lg items-start gap-2.5 rounded-pop px-3.5 py-2.5 text-sm shadow-pop",
            notice.kind === "error" ? "bg-blade text-white" : "bg-ink text-on-ink",
          )}
        >
          {notice.kind === "error" ? (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <p className="flex-1">{notice.message}</p>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={dismiss}
            className="-mr-1 grid size-6 shrink-0 place-items-center rounded hover:bg-on-ink/15"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
