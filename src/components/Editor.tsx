"use client";

import { EmptyState } from "./EmptyState";
import { ImportDialog } from "./ImportDialog";
import { Inspector } from "./Inspector";
import { LayersPanel } from "./LayersPanel";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { NoticeToast } from "./NoticeToast";
import { PageBar } from "./PageBar";
import { StatusBar } from "./StatusBar";
import { TemplatesDialog } from "./TemplatesDialog";
import { ToolRail } from "./ToolRail";
import { TopBar } from "./TopBar";
import { MatCanvas } from "./canvas/MatCanvas";
import { TooltipProvider } from "./ui/Tooltip";
import { cn } from "./ui/cn";
import { useAutosave } from "./useAutosave";
import { useShortcuts } from "./useShortcuts";
import { useEditor } from "@/store/editorStore";

export default function Editor() {
  useAutosave();
  useShortcuts();
  const panelsOpen = useEditor((s) => s.panelsOpen);

  return (
    <TooltipProvider>
      <div className="grid h-dvh min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[3rem_minmax(0,1fr)] bg-bench text-ink">
        <TopBar />
        <div className="relative grid min-h-0 grid-cols-[3.5rem_minmax(0,1fr)] lg:grid-cols-[3.5rem_minmax(0,1fr)_20rem]">
          <ToolRail />
          <main className="mat-stage relative min-h-0 min-w-0 overflow-hidden" aria-label="Cutting mat">
            <MatCanvas />
            <EmptyState />
            <PageBar />
            <StatusBar />
          </main>
          <aside
            aria-label="Layers and properties"
            className={cn(
              "scroll-thin min-h-0 overflow-y-auto border-l border-line bg-panel",
              "max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:w-80 max-lg:max-w-[88vw] max-lg:shadow-pop",
              panelsOpen ? "" : "max-lg:hidden",
            )}
          >
            <LayersPanel />
            <Inspector />
          </aside>
        </div>
      </div>
      <ImportDialog />
      <TemplatesDialog />
      <CanvasContextMenu />
      <NoticeToast />
    </TooltipProvider>
  );
}
