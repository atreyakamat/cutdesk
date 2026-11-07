/** Keyboard shortcuts shown in the help sheet. Keep in sync with useShortcuts. */

export interface Shortcut {
  keys: string;
  label: string;
}

export interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Tools",
    items: [
      { keys: "V", label: "Select" },
      { keys: "R", label: "Rectangle" },
      { keys: "E", label: "Ellipse" },
      { keys: "P", label: "Pen" },
      { keys: "T", label: "Text" },
      { keys: "H", label: "Pan" },
      { keys: "I", label: "Trace an image" },
    ],
  },
  {
    title: "Edit",
    items: [
      { keys: "Ctrl Z", label: "Undo" },
      { keys: "Ctrl Shift Z", label: "Redo" },
      { keys: "Ctrl C", label: "Copy" },
      { keys: "Ctrl X", label: "Cut" },
      { keys: "Ctrl V", label: "Paste" },
      { keys: "Ctrl D", label: "Duplicate" },
      { keys: "Ctrl A", label: "Select all" },
      { keys: "Ctrl G", label: "Group" },
      { keys: "Ctrl Shift G", label: "Ungroup" },
      { keys: "Del", label: "Delete" },
    ],
  },
  {
    title: "Move",
    items: [
      { keys: "Arrows", label: "Nudge 1 mm" },
      { keys: "Shift Arrows", label: "Nudge 10 mm" },
      { keys: "Alt drag", label: "Drag without snapping" },
    ],
  },
  {
    title: "View",
    items: [
      { keys: "Ctrl +", label: "Zoom in" },
      { keys: "Ctrl -", label: "Zoom out" },
      { keys: "Ctrl 0", label: "Fit to screen" },
      { keys: "Space drag", label: "Pan the canvas" },
    ],
  },
  {
    title: "File",
    items: [
      { keys: "Ctrl S", label: "Save project" },
      { keys: "?", label: "Show this help" },
    ],
  },
];
