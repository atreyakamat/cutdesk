import { describe, expect, it } from "vitest";
import { looksEncrypted, parseCaptureLog, shannonEntropy, summarize } from "./capture";

describe("capture log parsing", () => {
  it("parses direction-tagged hex with mixed formatting", () => {
    const log = [
      "# a comment",
      "",
      "TX 02 00 1e 00",
      "RX: 0x90 0x00",
      "OUT 0a:0b:0c",
      "in ffee",
    ].join("\n");
    const frames = parseCaptureLog(log);
    expect(frames.map((f) => f.dir)).toEqual(["tx", "rx", "tx", "rx"]);
    expect(Array.from(frames[0].bytes)).toEqual([0x02, 0x00, 0x1e, 0x00]);
    expect(Array.from(frames[1].bytes)).toEqual([0x90, 0x00]);
    expect(Array.from(frames[2].bytes)).toEqual([0x0a, 0x0b, 0x0c]);
    expect(Array.from(frames[3].bytes)).toEqual([0xff, 0xee]);
  });

  it("joins a bare-hex continuation line onto the previous frame", () => {
    const frames = parseCaptureLog(["TX 01 02", "03 04 05", "RX 99"].join("\n"));
    expect(frames).toHaveLength(2);
    expect(Array.from(frames[0].bytes)).toEqual([1, 2, 3, 4, 5]);
    expect(Array.from(frames[1].bytes)).toEqual([0x99]);
  });

  it("ignores odd-length stray tokens but keeps valid pairs", () => {
    const frames = parseCaptureLog("TX 12 3 34");
    expect(Array.from(frames[0].bytes)).toEqual([0x12, 0x34]);
  });

  it("drops a continuation with no preceding frame", () => {
    expect(parseCaptureLog("00 11 22")).toHaveLength(0);
  });
});

describe("entropy", () => {
  it("is 0 for a single repeated byte and 8 for a full uniform spread", () => {
    expect(shannonEntropy([Uint8Array.from([7, 7, 7, 7])])).toBe(0);
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(shannonEntropy([all])).toBeCloseTo(8, 10);
  });

  it("is ~1 bit for a two-symbol stream", () => {
    const bytes = Uint8Array.from({ length: 100 }, (_, i) => (i % 2 ? 0xaa : 0x55));
    expect(shannonEntropy([bytes])).toBeCloseTo(1, 10);
  });
});

describe("summary + encryption heuristic", () => {
  it("separates directions, finds the common header, and flags structured vs random", () => {
    // 16 structured tx frames that all share a 02 00 header → low entropy.
    const tx = Array.from({ length: 16 }, (_, i) => `TX 02 00 ${i.toString(16).padStart(2, "0")} 00`);
    // one long high-entropy rx frame (0..255 repeated) → random-looking.
    const spread = Array.from({ length: 512 }, (_, i) => (i % 256).toString(16).padStart(2, "0")).join(" ");
    const frames = parseCaptureLog([...tx, `RX ${spread}`].join("\n"));

    const s = summarize(frames);
    expect(s.tx.frames).toBe(16);
    expect(s.tx.topPrefixes[0]).toEqual({ hex: "02 00 00 00", count: 1 });
    // every tx frame shares the first two bytes, so entropy is low
    expect(s.tx.entropyBits).toBeLessThan(4);
    expect(looksEncrypted(s.tx)).toBe(false);

    expect(s.rx.bytes).toBe(512);
    expect(s.rx.entropyBits).toBeCloseTo(8, 1);
    expect(looksEncrypted(s.rx)).toBe(true);
  });

  it("does not flag a short high-entropy sample (too little data)", () => {
    const frames = parseCaptureLog("RX 00 11 22 33 44 55 66 77");
    expect(looksEncrypted(summarize(frames).rx)).toBe(false);
  });
});
