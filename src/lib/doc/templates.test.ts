import { describe, expect, it } from "vitest";
import { buildCutPlan } from "./cutPlan";
import { BUILTIN_TEMPLATES } from "./templates";

describe("built-in templates", () => {
  it("each builds a valid, non-empty, cut-ready document", () => {
    for (const t of BUILTIN_TEMPLATES) {
      const doc = t.build();
      expect(doc.layers.length).toBeGreaterThan(0);
      expect(doc.objects.length).toBeGreaterThan(0);
      // Every object points at a real layer.
      const layerIds = new Set(doc.layers.map((l) => l.id));
      expect(doc.objects.every((o) => layerIds.has(o.layerId))).toBe(true);
      // Something actually cuts/scores.
      expect(buildCutPlan(doc).totalLength).toBeGreaterThan(0);
    }
  });

  it("gives every object a unique id within a page", () => {
    for (const t of BUILTIN_TEMPLATES) {
      const ids = t.build().objects.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("builds fresh ids on each call so two pages don't share objects", () => {
    const a = BUILTIN_TEMPLATES[0].build();
    const b = BUILTIN_TEMPLATES[0].build();
    const aIds = new Set(a.objects.map((o) => o.id));
    expect(b.objects.some((o) => aIds.has(o.id))).toBe(false);
  });
});
