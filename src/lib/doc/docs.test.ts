import { describe, expect, it } from "vitest";
import { buildCutPlan, objectsOutsideMat, pointAtDistance } from "./cutPlan";
import { createDefaultDoc, createLayer } from "./defaults";
import { ProjectError, parseProject, serializeProject } from "./project";
import { exportFileName, exportSvg, slugify } from "./svg";
import type { DesignObject, Doc } from "./types";

function obj(over: Partial<DesignObject> & Pick<DesignObject, "id" | "layerId" | "geo">): DesignObject {
  return { name: over.id, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, ...over };
}

function sampleDoc(): Doc {
  const doc = createDefaultDoc();
  const [cut, score] = doc.layers;
  const art = createLayer("print", "Artwork");
  return {
    ...doc,
    name: "Sticker & <test>",
    layers: [...doc.layers, art],
    objects: [
      obj({ id: "box", layerId: cut.id, x: 10, y: 20, geo: { kind: "rect", width: 30, height: 10, cornerRadius: 0 } }),
      obj({ id: "ring", layerId: score.id, x: 100, y: 100, geo: { kind: "ellipse", rx: 10, ry: 10 } }),
      obj({
        id: "pic",
        layerId: art.id,
        geo: { kind: "image", src: "data:image/png;base64,AAAA", width: 20, height: 20 },
      }),
    ],
  };
}

describe("exportSvg", () => {
  it("sizes the file in millimetres from the mat", () => {
    const svg = exportSvg(sampleDoc());
    expect(svg).toContain('width="304.8mm" height="304.8mm" viewBox="0 0 304.8 304.8"');
  });

  it("bakes transforms into path data and writes no transform on cut geometry", () => {
    const svg = exportSvg(sampleDoc(), { operations: ["cut"] });
    expect(svg).toContain('d="M10 20L40 20L40 30L10 30Z"');
    expect(svg).not.toContain("transform=");
    expect(svg).toContain('data-operation="cut"');
    expect(svg).toContain('stroke="#FF0000"');
  });

  it("filters by operation", () => {
    const svg = exportSvg(sampleDoc(), { operations: ["score"] });
    expect(svg).toContain('data-operation="score"');
    expect(svg).not.toContain('data-operation="cut"');
    expect(svg).toContain('stroke="#0000FF"');
  });

  it("keeps reference artwork as an image only when included", () => {
    expect(exportSvg(sampleDoc())).toContain("<image ");
    expect(exportSvg(sampleDoc(), { includeReference: false })).not.toContain("<image ");
    expect(exportSvg(sampleDoc(), { operations: ["cut"] })).not.toContain("<image ");
  });

  it("skips hidden layers and escapes the title", () => {
    const doc = sampleDoc();
    const hidden = { ...doc, layers: doc.layers.map((l) => (l.operation === "score" ? { ...l, visible: false } : l)) };
    const svg = exportSvg(hidden);
    expect(svg).not.toContain('data-operation="score"');
    expect(svg).toContain("<title>Sticker &amp; &lt;test&gt;</title>");
  });

  it("produces a well-formed file name", () => {
    expect(slugify("  My Sticker #1! ")).toBe("my-sticker-1");
    expect(slugify("???")).toBe("design");
    expect(exportFileName(sampleDoc(), "cut")).toBe("sticker-test-cut.svg");
  });
});

describe("project files", () => {
  it("round-trips a document", () => {
    const doc = sampleDoc();
    expect(parseProject(serializeProject(doc))).toEqual(doc);
  });

  it("rejects text that isn't JSON", () => {
    expect(() => parseProject("not json")).toThrow(ProjectError);
  });

  it("rejects JSON that isn't a CutDesk project", () => {
    expect(() => parseProject(JSON.stringify({ hello: "world" }))).toThrow(/isn't a CutDesk project/);
  });

  it("explains where a damaged file is wrong", () => {
    const bad = JSON.parse(serializeProject(sampleDoc()));
    bad.doc.mat.width = -5;
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/damaged.*mat\.width/);
  });

  it("moves objects on a missing layer to the first layer", () => {
    const bad = JSON.parse(serializeProject(sampleDoc()));
    bad.doc.objects[0].layerId = "gone";
    const doc = parseProject(JSON.stringify(bad));
    expect(doc.objects[0].layerId).toBe(doc.layers[0].id);
  });

  it("drops duplicate object ids", () => {
    const bad = JSON.parse(serializeProject(sampleDoc()));
    bad.doc.objects.push({ ...bad.doc.objects[0] });
    expect(parseProject(JSON.stringify(bad)).objects).toHaveLength(3);
  });
});

describe("buildCutPlan", () => {
  it("orders draw, then score, then cut, and leaves out reference art", () => {
    const plan = buildCutPlan(sampleDoc());
    expect(plan.passes.map((p) => p.operation)).toEqual(["score", "cut"]);
    expect(plan.passes[1].start).toBeCloseTo(plan.passes[0].length, 6);
  });

  it("totals lengths per operation", () => {
    const plan = buildCutPlan(sampleDoc());
    expect(plan.lengthByOperation.cut).toBeCloseTo(80, 6);
    expect(plan.lengthByOperation.score).toBeCloseTo(2 * Math.PI * 10, 0);
    expect(plan.totalLength).toBeCloseTo(plan.lengthByOperation.cut + plan.lengthByOperation.score, 6);
  });

  it("skips hidden layers", () => {
    const doc = sampleDoc();
    const plan = buildCutPlan({ ...doc, layers: doc.layers.map((l) => (l.operation === "cut" ? { ...l, visible: false } : l)) });
    expect(plan.lengthByOperation.cut).toBe(0);
  });

  it("finds the blade position along the plan", () => {
    const doc = sampleDoc();
    const only = { ...doc, objects: doc.objects.filter((o) => o.id === "box") };
    const plan = buildCutPlan(only);
    expect(pointAtDistance(plan, 0)).toEqual({ x: 10, y: 20 });
    expect(pointAtDistance(plan, 15)).toEqual({ x: 25, y: 20 });
    expect(pointAtDistance(plan, 1e6)).toEqual({ x: 10, y: 20 });
    expect(pointAtDistance(buildCutPlan({ ...doc, objects: [] }), 5)).toBeNull();
  });
});

describe("objectsOutsideMat", () => {
  it("flags cut geometry that leaves the mat but ignores reference art", () => {
    const doc = sampleDoc();
    const [cut] = doc.layers;
    const art = doc.layers[2];
    const moved: Doc = {
      ...doc,
      objects: [
        ...doc.objects,
        obj({ id: "off", layerId: cut.id, x: 300, y: 10, geo: { kind: "rect", width: 30, height: 10, cornerRadius: 0 } }),
        obj({ id: "offArt", layerId: art.id, x: 400, y: 10, geo: { kind: "image", src: "data:image/png;base64,AA", width: 5, height: 5 } }),
      ],
    };
    expect(objectsOutsideMat(moved)).toEqual(["off"]);
    expect(objectsOutsideMat(doc)).toEqual([]);
  });
});
