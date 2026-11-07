import { describe, expect, it } from "vitest";
import { jpegToPdf, mmToPt } from "./pdf";
import { exportVisualSvg, rasterSize } from "./raster";
import type { Doc } from "./types";

function doc(): Doc {
  return {
    name: "Visual",
    unit: "mm",
    mat: { preset: "custom", width: 100, height: 50 },
    layers: [{ id: "L1", name: "Cut", operation: "cut", color: "#4DABF7", visible: true, locked: false }],
    objects: [
      {
        id: "o1",
        name: "r",
        layerId: "L1",
        geo: { kind: "rect", width: 20, height: 20, cornerRadius: 0 },
        x: 10,
        y: 10,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
    ],
  };
}

describe("exportVisualSvg", () => {
  it("fills a cut shape with the layer colour and sizes the page to the mat", () => {
    const svg = exportVisualSvg(doc());
    expect(svg).toContain('width="100mm" height="50mm"');
    expect(svg).toContain('fill="#4DABF7"');
  });

  it("uses a per-object fill and opacity when set", () => {
    const d = doc();
    d.objects[0].style = { fill: "#FF8FA3", opacity: 0.4 };
    const svg = exportVisualSvg(d);
    expect(svg).toContain('fill="#FF8FA3"');
    expect(svg).toContain('opacity="0.4"');
  });

  it("omits a background by default and draws one when asked", () => {
    expect(exportVisualSvg(doc())).not.toContain("<rect");
    expect(exportVisualSvg(doc(), { background: "#ffffff" })).toContain('fill="#ffffff"');
  });
});

describe("rasterSize", () => {
  it("scales by DPI and caps the longest side", () => {
    expect(rasterSize({ ...doc(), mat: { preset: "custom", width: 25.4, height: 12.7 } }, 300)).toEqual({ width: 300, height: 150 });
    const big = rasterSize({ ...doc(), mat: { preset: "custom", width: 1000, height: 500 } }, 300, 4000);
    expect(Math.max(big.width, big.height)).toBe(4000);
  });
});

describe("jpegToPdf", () => {
  it("wraps JPEG bytes in a valid single-page PDF", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]); // tiny stand-in
    const pdf = jpegToPdf(jpeg, 200, 100, mmToPt(100), mmToPt(50));
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/DCTDecode");
    expect(text).toContain("/MediaBox [0 0 283.46 141.73]");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });
});
