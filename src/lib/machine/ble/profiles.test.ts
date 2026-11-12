import { describe, expect, it } from "vitest";
import { chunkBytes, normalizeUuid, parseUuidList, pickProfile, toHex, UART_PROFILES } from "./profiles";

describe("normalizeUuid", () => {
  it("expands 16-bit forms and lower-cases full ones", () => {
    expect(normalizeUuid("FFE0")).toBe("0000ffe0-0000-1000-8000-00805f9b34fb");
    expect(normalizeUuid("0xffe0")).toBe("0000ffe0-0000-1000-8000-00805f9b34fb");
    expect(normalizeUuid("6E400001-B5A3-F393-E0A9-E50E24DCCA9E")).toBe("6e400001-b5a3-f393-e0a9-e50e24dcca9e");
  });
  it("rejects junk", () => {
    for (const bad of ["", "xyz", "ffe", "ffe00", "6e400001-b5a3-f393-e0a9", "6e400001b5a3f393e0a9e50e24dcca9e"]) {
      expect(normalizeUuid(bad), bad).toBeNull();
    }
  });
});

describe("parseUuidList", () => {
  it("splits, de-duplicates and reports rejects", () => {
    const r = parseUuidList("ffe0, FFE0;6e400001-b5a3-f393-e0a9-e50e24dcca9e  nope");
    expect(r.uuids).toEqual(["0000ffe0-0000-1000-8000-00805f9b34fb", "6e400001-b5a3-f393-e0a9-e50e24dcca9e"]);
    expect(r.rejected).toEqual(["nope"]);
  });
  it("handles empty input", () => {
    expect(parseUuidList("   ")).toEqual({ uuids: [], rejected: [] });
  });
});

describe("pickProfile", () => {
  it("finds a known service regardless of case and order", () => {
    expect(pickProfile(["0000180a-0000-1000-8000-00805f9b34fb", "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"])?.id).toBe("nus");
    expect(pickProfile([UART_PROFILES[1].service])?.id).toBe("ffe0");
  });
  it("returns null for a device with no serial service", () => {
    expect(pickProfile(["0000180f-0000-1000-8000-00805f9b34fb"])).toBeNull();
    expect(pickProfile([])).toBeNull();
  });
});

describe("chunkBytes", () => {
  it("splits into pieces of at most `size` and keeps every byte in order", () => {
    const bytes = Uint8Array.from({ length: 45 }, (_, i) => i);
    const parts = chunkBytes(bytes, 20);
    expect(parts.map((p) => p.length)).toEqual([20, 20, 5]);
    expect(Uint8Array.from(parts.flatMap((p) => [...p]))).toEqual(bytes);
  });
  it("returns nothing for no bytes, and never loops on a bad size", () => {
    expect(chunkBytes(new Uint8Array(0), 20)).toEqual([]);
    expect(chunkBytes(Uint8Array.of(1, 2, 3), 0).map((p) => p.length)).toEqual([1, 1, 1]);
    expect(chunkBytes(Uint8Array.of(1, 2, 3), Number.NaN).length).toBeGreaterThan(0);
  });
  it("copies, so later changes to the source don't alter queued writes", () => {
    const src = Uint8Array.of(1, 2, 3);
    const [part] = chunkBytes(src, 20);
    src[0] = 99;
    expect(part[0]).toBe(1);
  });
});

describe("toHex", () => {
  it("formats bytes the way the capture parser reads them", () => {
    expect(toHex(Uint8Array.of(0, 15, 255))).toBe("00 0f ff");
  });
});
