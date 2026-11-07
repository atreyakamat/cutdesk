/** Items for the canvas right-click menu, derived from the current selection. */

export interface CtxItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  /** Draw a divider above this item. */
  separatorBefore?: boolean;
}

export interface CtxState {
  hasSelection: boolean;
  /** Two or more objects selected (Group is meaningful). */
  multi: boolean;
  canPaste: boolean;
  /** The selection contains a grouped object (Ungroup is meaningful). */
  grouped: boolean;
}

/**
 * Keep the menu fully on screen. Hostile or stray inputs (negative, overflowing,
 * NaN/Infinity) are coerced to a finite in-viewport position.
 */
export function clampMenuPosition(
  x: number,
  y: number,
  menuW: number,
  menuH: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const fx = Number.isFinite(x) ? x : 0;
  const fy = Number.isFinite(y) ? y : 0;
  const maxX = Math.max(0, viewW - menuW);
  const maxY = Math.max(0, viewH - menuH);
  return { x: Math.min(Math.max(0, fx), maxX), y: Math.min(Math.max(0, fy), maxY) };
}

export function contextMenuItems(s: CtxState): CtxItem[] {
  if (!s.hasSelection) {
    return [
      { id: "paste", label: "Paste", shortcut: "Ctrl V", disabled: !s.canPaste },
      { id: "selectAll", label: "Select all", shortcut: "Ctrl A" },
    ];
  }
  return [
    { id: "copy", label: "Copy", shortcut: "Ctrl C" },
    { id: "cut", label: "Cut", shortcut: "Ctrl X" },
    { id: "paste", label: "Paste", shortcut: "Ctrl V", disabled: !s.canPaste },
    { id: "duplicate", label: "Duplicate", shortcut: "Ctrl D", separatorBefore: true },
    { id: "group", label: "Group", shortcut: "Ctrl G", disabled: !s.multi },
    { id: "ungroup", label: "Ungroup", shortcut: "Ctrl Shift G", disabled: !s.grouped },
    { id: "front", label: "Bring to front", separatorBefore: true },
    { id: "back", label: "Send to back" },
    { id: "delete", label: "Delete", shortcut: "Del", danger: true, separatorBefore: true },
  ];
}
