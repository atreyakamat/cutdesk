"use client";

import { ChevronDown, Download, FilePlus2, FolderOpen, LayoutTemplate, Play, Redo2, Save, Undo2 } from "lucide-react";
import { DropdownMenu as M } from "radix-ui";
import type { ReactNode } from "react";
import { exportPdfFile, exportPngFile, exportPrintableFile, exportSvgFile, openProjectFile, saveProjectFile } from "@/lib/files";
import type { ExportKind } from "@/lib/doc/svg";
import { useEditor } from "@/store/editorStore";
import { Logo } from "./Logo";
import { SendDialog } from "./SendDialog";
import { Button } from "./ui/Controls";
import { IconButton } from "./ui/IconButton";
import { ThemeToggle } from "./ui/ThemeToggle";
import { cn } from "./ui/cn";

function MenuContent({ children, align = "end" }: { children: ReactNode; align?: "start" | "end" }) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className="pop-in z-50 min-w-56 rounded-pop bg-panel p-1.5 shadow-pop outline-none"
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

function Item({
  icon,
  children,
  hint,
  onSelect,
}: {
  icon?: ReactNode;
  children: ReactNode;
  hint?: string;
  onSelect: () => void;
}) {
  return (
    <M.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-default items-center gap-2.5 rounded-control px-2.5 py-2 text-sm outline-none",
        "data-[highlighted]:bg-ink data-[highlighted]:text-on-ink",
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {hint ? <span className="text-xs opacity-60">{hint}</span> : null}
    </M.Item>
  );
}

const EXPORTS: ReadonlyArray<{ kind: ExportKind; label: string; hint: string }> = [
  { kind: "all", label: "Everything", hint: "All layers" },
  { kind: "cut", label: "Cut lines only", hint: "Red" },
  { kind: "score", label: "Score lines only", hint: "Blue" },
  { kind: "draw", label: "Draw lines only", hint: "Black" },
];

export function TopBar() {
  const name = useEditor((s) => s.doc.name);
  const setName = useEditor((s) => s.setName);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const startPreview = useEditor((s) => s.startPreview);
  const previewing = useEditor((s) => s.preview !== null);
  const newDoc = useEditor((s) => s.newDoc);
  const openTemplates = useEditor((s) => s.setTemplatesOpen);

  return (
    <header className="flex h-12 items-center gap-2 border-b border-line bg-panel px-3">
      <div className="flex items-center gap-2 pr-1">
        <Logo className="size-6" />
        <span className="hidden font-display text-[17px] font-semibold tracking-tight sm:inline">CutDesk</span>
      </div>

      <input
        aria-label="Design name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        className="h-8 w-16 min-w-0 flex-1 sm:flex-none rounded-control border border-transparent bg-transparent px-2 text-sm font-medium hover:border-line focus:border-ink focus:bg-raised sm:w-56"
      />

      <div className="flex items-center">
        <IconButton icon={Undo2} label="Undo" shortcut="Ctrl Z" disabled={!canUndo} onClick={undo} />
        <IconButton icon={Redo2} label="Redo" shortcut="Ctrl Shift Z" disabled={!canRedo} onClick={redo} />
        <ThemeToggle />
      </div>

      <div className="hidden flex-1 sm:block" />

      <Button variant="secondary" onClick={startPreview} disabled={previewing} aria-label="Preview the cut order">
        <Play className="size-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Preview cut</span>
      </Button>

      <SendDialog />

      <M.Root>
        <M.Trigger asChild>
          <Button variant="ghost" aria-label="File menu">
            <FolderOpen className="size-3.5 sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">File</span>
            <ChevronDown className="hidden size-3.5 opacity-60 sm:inline" aria-hidden="true" />
          </Button>
        </M.Trigger>
        <MenuContent>
          <Item icon={<FilePlus2 className="size-4" />} onSelect={newDoc}>
            New design
          </Item>
          <Item icon={<LayoutTemplate className="size-4" />} onSelect={() => openTemplates(true)}>
            Templates & pages…
          </Item>
          <Item icon={<FolderOpen className="size-4" />} onSelect={() => void openProjectFile()}>
            Open project…
          </Item>
          <Item icon={<Save className="size-4" />} hint="Ctrl S" onSelect={saveProjectFile}>
            Save project
          </Item>
        </MenuContent>
      </M.Root>

      <M.Root>
        <M.Trigger asChild>
          <Button variant="primary" aria-label="Export menu">
            <Download className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Export SVG</span>
            <ChevronDown className="size-3.5 opacity-70" aria-hidden="true" />
          </Button>
        </M.Trigger>
        <MenuContent>
          {EXPORTS.map((e) => (
            <Item key={e.kind} hint={e.hint} onSelect={() => exportSvgFile(e.kind)}>
              {e.label}
            </Item>
          ))}
          <Item hint="Reg. marks" onSelect={exportPrintableFile}>
            Print-then-cut layout
          </Item>
          <div className="my-1 h-px bg-line" role="separator" />
          <Item hint="Image" onSelect={() => void exportPngFile()}>
            PNG image
          </Item>
          <Item hint="Document" onSelect={() => void exportPdfFile()}>
            PDF document
          </Item>
        </MenuContent>
      </M.Root>
    </header>
  );
}
