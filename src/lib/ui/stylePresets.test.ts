import { beforeEach, describe, expect, it } from "vitest";
import { listStylePresets, saveStylePreset, deleteStylePreset, MAX_PRESETS } from "./stylePresets";

function mockLocalStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
  } as Storage;
}

beforeEach(() => {
  (globalThis as { localStorage: Storage }).localStorage = mockLocalStorage();
});

describe("style presets", () => {
  it("saves and lists a valid preset", () => {
    expect(saveStylePreset("#FF8FA3", 0.5)).toBe(true);
    const list = listStylePresets();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ fill: "#FF8FA3", opacity: 0.5 });
    expect(typeof list[0].id).toBe("string");
  });

  it("rejects a non-hex fill (never persists renderable garbage)", () => {
    expect(saveStylePreset("red; drop table", 1)).toBe(false);
    expect(saveStylePreset("#xyz", 1)).toBe(false);
    expect(listStylePresets()).toHaveLength(0);
  });

  it("clamps opacity into [0,1]", () => {
    saveStylePreset("#000000", 5);
    saveStylePreset("#111111", -2);
    const byFill = Object.fromEntries(listStylePresets().map((p) => [p.fill, p.opacity]));
    expect(byFill["#000000"]).toBe(1);
    expect(byFill["#111111"]).toBe(0);
  });

  it("deletes by id", () => {
    saveStylePreset("#222222", 1);
    const id = listStylePresets()[0].id;
    deleteStylePreset(id);
    expect(listStylePresets()).toHaveLength(0);
  });

  // --- Adversarial hardening: storage contents are untrusted ----------------

  it("R1: corrupt / non-array storage yields an empty list, never throws", () => {
    localStorage.setItem("cutdesk:style-presets:v1", "{not json");
    expect(() => listStylePresets()).not.toThrow();
    expect(listStylePresets()).toEqual([]);
    localStorage.setItem("cutdesk:style-presets:v1", JSON.stringify({ evil: true }));
    expect(listStylePresets()).toEqual([]);
  });

  it("R2: tampered items (injection fills, bad ranges, missing fields) are filtered out", () => {
    localStorage.setItem(
      "cutdesk:style-presets:v1",
      JSON.stringify([
        { id: "ok", fill: "#4DABF7", opacity: 0.8 },
        { id: "x1", fill: "url(javascript:alert(1))", opacity: 1 },
        { id: "x2", fill: "#fff; }", opacity: 1 },
        { id: "x3", fill: "#000000", opacity: 5 },
        { id: "x4", opacity: 1 },
      ]),
    );
    const list = listStylePresets();
    expect(list).toHaveLength(1);
    expect(list[0].fill).toBe("#4DABF7");
  });

  it("R3: never stores more than the cap", () => {
    for (let i = 0; i < MAX_PRESETS + 8; i++) {
      saveStylePreset(`#${i.toString(16).padStart(6, "0")}`, 1);
    }
    expect(listStylePresets().length).toBe(MAX_PRESETS);
  });
});
