import { describe, expect, it } from "vitest";
import { CODE39, code39Path } from "./barcode";
import { qrPath } from "./qr";

describe("qrPath", () => {
  it("encodes text into a square compound path at the target size", () => {
    const r = qrPath("https://stixnvibes.com", { sizeMm: 50 });
    expect(r.modules).toBeGreaterThan(10);
    expect(r.width).toBeCloseTo(50, 3);
    expect(r.height).toBeCloseTo(50, 3);
    expect((r.d.match(/M/g) ?? []).length).toBeGreaterThan(20);
  });
  it("handles empty text without throwing", () => {
    expect(() => qrPath("")).not.toThrow();
    expect(qrPath("").modules).toBeGreaterThan(0);
  });
});

describe("code39", () => {
  it("every pattern is 9 elements with exactly 3 wide (Code 39 invariant)", () => {
    for (const [ch, pat] of Object.entries(CODE39)) {
      expect(pat.length, ch).toBe(9);
      expect([...pat].filter((c) => c === "1").length, ch).toBe(3);
    }
  });

  it("encodes a string into bars with positive width", () => {
    const r = code39Path("ABC123", { heightMm: 20 });
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeCloseTo(20, 3);
    expect((r.d.match(/M/g) ?? []).length).toBeGreaterThan(5);
    expect(r.text).toBe("ABC123");
  });

  it("uppercases, drops unsupported characters, and never throws", () => {
    expect(() => code39Path("ab!@# 12")).not.toThrow();
    expect(code39Path("ab!@# 12").text).toBe("AB 12"); // '!','@','#' dropped, space kept
    expect(() => code39Path("")).not.toThrow();
  });
});
