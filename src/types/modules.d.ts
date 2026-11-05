// opentype.js 2.x ships no type declarations; this covers the small surface CutDesk uses.
declare module "opentype.js" {
  export interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }
  export interface PathCommand {
    type: "M" | "L" | "C" | "Q" | "Z";
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }
  export interface Path {
    commands: PathCommand[];
    getBoundingBox(): BoundingBox;
  }
  export interface Glyph {
    advanceWidth?: number;
    getPath(x: number, y: number, fontSize: number): Path;
  }
  export class Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    getPath(text: string, x: number, y: number, fontSize: number, options?: Record<string, unknown>): Path;
    charToGlyph(char: string): Glyph;
    getKerningValue(left: Glyph, right: Glyph): number;
  }
  export function parse(buffer: ArrayBuffer, options?: Record<string, unknown>): Font;
}

// imagetracerjs is an untyped UMD bundle.
declare module "imagetracerjs" {
  interface RawImageData {
    width: number;
    height: number;
    data: ArrayLike<number>;
  }
  const ImageTracer: {
    imagedataToSVG(imageData: RawImageData, options?: Record<string, unknown>): string;
  };
  export default ImageTracer;
}
