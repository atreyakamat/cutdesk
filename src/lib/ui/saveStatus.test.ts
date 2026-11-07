import { describe, expect, it } from "vitest";
import { saveStatusLabel, type SaveStatus } from "./saveStatus";

describe("saveStatusLabel", () => {
  it("maps each status to a label and tone", () => {
    expect(saveStatusLabel("saving")).toEqual({ text: "Saving…", tone: "muted" });
    expect(saveStatusLabel("saved")).toEqual({ text: "Saved", tone: "ok" });
    expect(saveStatusLabel("error").tone).toBe("error");
    expect(saveStatusLabel("idle").text).toBe(""); // nothing to show yet
  });

  it("never claims 'Saved' when saving or errored", () => {
    expect(saveStatusLabel("saving").text).not.toMatch(/saved/i);
    expect(saveStatusLabel("error").text).not.toMatch(/^saved$/i);
  });

  it("falls back safely for an unknown status", () => {
    expect(saveStatusLabel("bogus" as SaveStatus)).toEqual(saveStatusLabel("idle"));
  });

  // --- Adversarial hardening: a failed/pending save must never look "saved" ---

  it("R1: only 'saved' is allowed to render with the success tone", () => {
    const statuses: SaveStatus[] = ["idle", "saving", "saved", "error"];
    for (const s of statuses) {
      expect(saveStatusLabel(s).tone === "ok").toBe(s === "saved");
    }
  });

  it("R2: the error label guides the user to Save manually", () => {
    expect(saveStatusLabel("error").text.toLowerCase()).toContain("save project");
  });

  it("R3: every status yields a defined label with a known tone", () => {
    for (const s of ["idle", "saving", "saved", "error"] as SaveStatus[]) {
      const l = saveStatusLabel(s);
      expect(typeof l.text).toBe("string");
      expect(["muted", "ok", "error"]).toContain(l.tone);
    }
  });
});
