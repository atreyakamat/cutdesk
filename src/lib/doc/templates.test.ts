import { describe, expect, it } from "vitest";
import { buildCutPlan } from "./cutPlan";
import {
  BUILTIN_TEMPLATES,
  parseTemplatesBundle,
  serializeTemplatesBundle,
  TEMPLATE_BUNDLE_FORMAT,
  type UserTemplate,
} from "./templates";

const sampleTemplate = (): UserTemplate => ({
  id: "orig-id",
  name: "My sheet",
  doc: BUILTIN_TEMPLATES[0].build(),
  category: "Cards",
  description: "A test",
  createdAt: 123,
});

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

describe("template export / import bundle", () => {
  it("round-trips a template, preserving its doc and metadata", () => {
    const bundle = serializeTemplatesBundle([sampleTemplate()]);
    const [t] = parseTemplatesBundle(bundle);
    expect(t.name).toBe("My sheet");
    expect(t.category).toBe("Cards");
    expect(t.description).toBe("A test");
    expect(t.doc.objects.length).toBe(sampleTemplate().doc.objects.length);
    expect(buildCutPlan(t.doc).totalLength).toBeGreaterThan(0);
  });

  it("regenerates ids on import so an incoming id can't collide", () => {
    const [t] = parseTemplatesBundle(serializeTemplatesBundle([sampleTemplate()]));
    expect(t.id).not.toBe("orig-id");
    expect(t.id.length).toBeGreaterThan(0);
  });

  it("rejects non-JSON, the wrong format, and a malformed doc", () => {
    expect(() => parseTemplatesBundle("not json{")).toThrow();
    expect(() => parseTemplatesBundle(JSON.stringify({ format: "something-else", templates: [] }))).toThrow(
      /isn't a CutDesk template bundle/,
    );
    const broken = {
      format: TEMPLATE_BUNDLE_FORMAT,
      version: 1,
      templates: [{ name: "x", doc: { name: "x", unit: "mm", mat: {}, layers: [], objects: [] } }],
    };
    expect(() => parseTemplatesBundle(JSON.stringify(broken))).toThrow(/malformed/);
  });

  it("accepts an empty bundle", () => {
    expect(parseTemplatesBundle(serializeTemplatesBundle([]))).toEqual([]);
  });
});
