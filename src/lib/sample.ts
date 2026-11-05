import { createLayer } from "./doc/defaults";
import { newId } from "./doc/ids";
import { matFromPreset } from "./doc/mats";
import { normalizePath } from "./doc/pathData";
import type { DesignObject, Doc } from "./doc/types";
import { loadFont, textOutline } from "./text/fonts";

/**
 * A small sticker that shows all three operations at once: vinyl pieces to
 * cut, a kiss-cut score line, and a pen-drawn squiggle.
 */
export async function createSampleDoc(): Promise<Doc> {
  const font = await loadFont("lilita");
  const mat = matFromPreset("cricut-12x12");

  const base = createLayer("cut", "White vinyl");
  const letters = createLayer("cut", "Pink vinyl", "#FF8FA3");
  const dots = createLayer("cut", "Yellow vinyl", "#FFD43B");
  const score = createLayer("score", "Score line");
  const draw = createLayer("draw", "Pen");

  const w = 150;
  const h = 96;
  const x0 = mat.width / 2 - w / 2;
  const y0 = mat.height / 2 - h / 2;

  const make = (over: Partial<DesignObject> & Pick<DesignObject, "name" | "layerId" | "geo">): DesignObject => ({
    id: newId(),
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    ...over,
  });

  const word = textOutline(font, "hello", 46, 1);
  const squiggle = normalizePath("M0 0C8 -7 16 7 24 0S40 -7 48 0S64 -7 72 0");

  return {
    name: "Hello sticker",
    unit: "mm",
    mat,
    layers: [base, letters, dots, score, draw],
    objects: [
      make({
        name: "Sticker body",
        layerId: base.id,
        x: x0,
        y: y0,
        geo: { kind: "rect", width: w, height: h, cornerRadius: 26 },
      }),
      make({
        name: "hello",
        layerId: letters.id,
        x: x0 + (w - word.width) / 2,
        y: y0 + (h - word.height) / 2 - 6,
        geo: { kind: "text", text: "hello", fontId: "lilita", size: 46, letterSpacing: 1, ...word },
      }),
      make({
        name: "Dot 1",
        layerId: dots.id,
        x: x0 + w - 4,
        y: y0 + 6,
        geo: { kind: "ellipse", rx: 15, ry: 15 },
      }),
      make({
        name: "Dot 2",
        layerId: dots.id,
        x: x0 + 10,
        y: y0 + h + 2,
        geo: { kind: "ellipse", rx: 9, ry: 9 },
      }),
      make({
        name: "Kiss-cut line",
        layerId: score.id,
        x: x0 + 8,
        y: y0 + 8,
        geo: { kind: "rect", width: w - 16, height: h - 16, cornerRadius: 19 },
      }),
      make({
        name: "Squiggle",
        layerId: draw.id,
        x: x0 + (w - squiggle.width) / 2,
        y: y0 + h - 25,
        geo: { kind: "path", d: squiggle.d },
      }),
    ],
  };
}
