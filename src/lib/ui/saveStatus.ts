/** Autosave status shown in the top bar. */

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface SaveLabel {
  text: string;
  tone: "muted" | "ok" | "error";
}

export function saveStatusLabel(status: SaveStatus): SaveLabel {
  switch (status) {
    case "saving":
      return { text: "Saving…", tone: "muted" };
    case "saved":
      return { text: "Saved", tone: "ok" };
    case "error":
      return { text: "Not saved — use Save project", tone: "error" };
    case "idle":
    default:
      return { text: "", tone: "muted" };
  }
}
