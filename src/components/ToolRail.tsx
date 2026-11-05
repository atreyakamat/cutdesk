"use client";

import { Circle, Hand, ImagePlus, Layers, MousePointer2, PenTool, Square, Type, type LucideIcon } from "lucide-react";
import { useEditor, type Tool } from "@/store/editorStore";
import { IconButton } from "./ui/IconButton";

const TOOLS: ReadonlyArray<{ tool: Tool; label: string; shortcut: string; icon: LucideIcon }> = [
  { tool: "select", label: "Select", shortcut: "V", icon: MousePointer2 },
  { tool: "rect", label: "Rectangle", shortcut: "R", icon: Square },
  { tool: "ellipse", label: "Ellipse", shortcut: "E", icon: Circle },
  { tool: "pen", label: "Pen", shortcut: "P", icon: PenTool },
  { tool: "text", label: "Text", shortcut: "T", icon: Type },
  { tool: "hand", label: "Pan", shortcut: "H", icon: Hand },
];

export function ToolRail() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const openImport = useEditor((s) => s.openImport);
  const panelsOpen = useEditor((s) => s.panelsOpen);
  const setPanelsOpen = useEditor((s) => s.setPanelsOpen);

  return (
    <nav aria-label="Tools" className="flex flex-col items-center gap-1 border-r border-line bg-panel py-2">
      {TOOLS.map(({ tool: t, label, shortcut, icon }) => (
        <IconButton key={t} icon={icon} label={label} shortcut={shortcut} tipSide="right" pressed={tool === t} onClick={() => setTool(t)} />
      ))}
      <div className="my-1 h-px w-6 bg-line" role="separator" />
      <IconButton icon={ImagePlus} label="Trace an image" shortcut="I" tipSide="right" onClick={() => openImport()} />
      <div className="flex-1" />
      <IconButton
        icon={Layers}
        label={panelsOpen ? "Hide layers and properties" : "Show layers and properties"}
        tipSide="right"
        pressed={panelsOpen}
        className="lg:hidden"
        onClick={() => setPanelsOpen(!panelsOpen)}
      />
    </nav>
  );
}
