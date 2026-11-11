import { describe, expect, it } from "vitest";
import { addColor, MAX_BRAND_COLORS, normalizeHex, removeColor } from "./brandKit";

describe("brand kit colours", () => {
  it("normalizes valid hex and rejects the rest", () => {
    expect(normalizeHex("#AABBCC")).toBe("#aabbcc");
    expect(normalizeHex("#abc")).toBeNull();
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex("#12345g")).toBeNull();
  });

  it("prepends, de-duplicates case-insensitively, and ignores junk", () => {
    let list = addColor([], "#112233");
    list = addColor(list, "#445566");
    expect(list).toEqual(["#445566", "#112233"]);
    // re-adding an existing colour (different case) moves it to front, no dupe
    list = addColor(list, "#112233");
    expect(list).toEqual(["#112233", "#445566"]);
    expect(addColor(list, "nope")).toEqual(list);
  });

  it("caps the list length", () => {
    let list: string[] = [];
    for (let i = 0; i < MAX_BRAND_COLORS + 5; i++) {
      list = addColor(list, `#${i.toString(16).padStart(6, "0")}`);
    }
    expect(list).toHaveLength(MAX_BRAND_COLORS);
  });

  it("removes a colour case-insensitively", () => {
    expect(removeColor(["#112233", "#445566"], "#112233")).toEqual(["#445566"]);
    expect(removeColor(["#aabbcc"], "#AABBCC")).toEqual([]);
  });
});
