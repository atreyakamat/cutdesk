import { describe, expect, it } from "vitest";
import { classifyImport } from "./files";

describe("classifyImport", () => {
  it("routes projects, SVGs and images by name and MIME", () => {
    expect(classifyImport("art.cutdesk.json", "application/json")).toBe("project");
    expect(classifyImport("art.json", "")).toBe("project");
    expect(classifyImport("logo.svg", "image/svg+xml")).toBe("svg");
    expect(classifyImport("logo.SVG", "")).toBe("svg");
    expect(classifyImport("photo.png", "image/png")).toBe("image");
    expect(classifyImport("photo", "image/jpeg")).toBe("image");
    expect(classifyImport("scan.webp", "")).toBe("image");
  });

  it("prefers SVG over the generic image rule, and rejects unknowns", () => {
    // image/svg+xml starts with "image/" but must classify as svg, not image
    expect(classifyImport("x.svg", "image/svg+xml")).toBe("svg");
    expect(classifyImport("notes.txt", "text/plain")).toBeNull();
    expect(classifyImport("data.csv", "")).toBeNull();
  });
});
