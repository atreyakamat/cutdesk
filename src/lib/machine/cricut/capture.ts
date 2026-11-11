/**
 * Capture-analysis toolkit for reverse-engineering the Cricut Explore 3 USB
 * protocol. This is the FIRST step of Phase 2: before a single byte is ever
 * sent to a real machine, we take a USB capture of Cricut Design Space driving
 * the Explore 3 (see docs/cricut-explore3.md) and analyse it here — frame
 * boundaries, per-direction byte totals, repeated headers, and an entropy
 * estimate that tells us whether the stream is plaintext or (likely) encrypted.
 *
 * Nothing in this file touches hardware. It only parses and summarises a log.
 */

export type Dir = "tx" | "rx";

export interface CaptureFrame {
  /** tx = host → machine (OUT), rx = machine → host (IN). */
  dir: Dir;
  bytes: Uint8Array;
}

export interface DirSummary {
  frames: number;
  bytes: number;
  minLen: number;
  maxLen: number;
  meanLen: number;
  /** Shannon entropy of the byte stream, in bits/byte (0–8). ≳7.5 hints at encryption/compression. */
  entropyBits: number;
  /** Most common leading-byte signatures across frames — candidate headers. */
  topPrefixes: { hex: string; count: number }[];
}

export interface CaptureSummary {
  tx: DirSummary;
  rx: DirSummary;
}

const TX_TOKENS = new Set(["tx", "out", "send", "write", "h->d", "host->device", "h2d", ">"]);
const RX_TOKENS = new Set(["rx", "in", "recv", "read", "d->h", "device->host", "d2h", "<"]);

function dirOf(token: string): Dir | null {
  const t = token.toLowerCase().replace(/:$/, "");
  if (TX_TOKENS.has(t)) return "tx";
  if (RX_TOKENS.has(t)) return "rx";
  return null;
}

/** Pull every byte (00–ff) out of a run of tokens, tolerating 0x, colons and whitespace. */
function hexBytes(tokens: string[]): number[] {
  const out: number[] = [];
  for (let tok of tokens) {
    tok = tok.replace(/^0x/i, "").replace(/[:,]/g, "");
    if (tok.length === 0 || !/^[0-9a-f]+$/i.test(tok)) continue;
    // A clean pair, or a run of pairs ("001122") — but not an odd-length stray.
    if (tok.length % 2 !== 0) continue;
    for (let i = 0; i < tok.length; i += 2) out.push(parseInt(tok.slice(i, i + 2), 16));
  }
  return out;
}

/**
 * Parse a direction-tagged hex log into frames. Tolerant by design so it accepts
 * hand-made dumps, `tshark` output, and Wireshark "export packet bytes":
 *   TX 02 00 1e 00 ...        → one tx frame
 *   RX: 0x90 0x00             → one rx frame
 *   # comments and blank lines are ignored
 * A line of bare hex with no direction token continues the previous frame, so
 * multi-line packet hex dumps are joined correctly.
 */
export function parseCaptureLog(text: string): CaptureFrame[] {
  const frames: CaptureFrame[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#") || line.startsWith("//")) continue;

    const tokens = line.split(/\s+/);
    // The direction token is the first non-hex, non-timestamp token.
    let dir: Dir | null = null;
    let rest = tokens;
    for (let i = 0; i < tokens.length; i++) {
      const d = dirOf(tokens[i]);
      if (d) {
        dir = d;
        rest = tokens.slice(i + 1);
        break;
      }
    }

    const bytes = hexBytes(rest);
    if (bytes.length === 0) continue;

    if (dir === null) {
      // Continuation of the previous frame's hex payload.
      const prev = frames[frames.length - 1];
      if (!prev) continue;
      const merged = new Uint8Array(prev.bytes.length + bytes.length);
      merged.set(prev.bytes, 0);
      merged.set(bytes, prev.bytes.length);
      prev.bytes = merged;
      continue;
    }

    frames.push({ dir, bytes: Uint8Array.from(bytes) });
  }
  return frames;
}

/** Shannon entropy in bits/byte over a set of byte arrays. Empty → 0. */
export function shannonEntropy(chunks: Uint8Array[]): number {
  const counts = new Array<number>(256).fill(0);
  let total = 0;
  for (const c of chunks) {
    for (const b of c) counts[b]++;
    total += c.length;
  }
  if (total === 0) return 0;
  let h = 0;
  for (const n of counts) {
    if (n === 0) continue;
    const p = n / total;
    h -= p * Math.log2(p);
  }
  return h;
}

function prefixHex(bytes: Uint8Array, n: number): string {
  return Array.from(bytes.slice(0, n), (b) => b.toString(16).padStart(2, "0")).join(" ");
}

function summariseDir(frames: CaptureFrame[], prefixLen = 4, topN = 5): DirSummary {
  const bytesArr = frames.map((f) => f.bytes);
  const lens = bytesArr.map((b) => b.length);
  const totalBytes = lens.reduce((a, b) => a + b, 0);

  const prefixCounts = new Map<string, number>();
  for (const b of bytesArr) {
    if (b.length === 0) continue;
    const key = prefixHex(b, prefixLen);
    prefixCounts.set(key, (prefixCounts.get(key) ?? 0) + 1);
  }
  const topPrefixes = [...prefixCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([hex, count]) => ({ hex, count }));

  return {
    frames: frames.length,
    bytes: totalBytes,
    minLen: lens.length ? Math.min(...lens) : 0,
    maxLen: lens.length ? Math.max(...lens) : 0,
    meanLen: lens.length ? totalBytes / lens.length : 0,
    entropyBits: shannonEntropy(bytesArr),
    topPrefixes,
  };
}

export function summarize(frames: CaptureFrame[]): CaptureSummary {
  return {
    tx: summariseDir(frames.filter((f) => f.dir === "tx")),
    rx: summariseDir(frames.filter((f) => f.dir === "rx")),
  };
}

/** True if a direction's stream looks encrypted/compressed rather than structured. */
export function looksEncrypted(dir: DirSummary): boolean {
  // High entropy only means something once there's a meaningful sample.
  return dir.bytes >= 256 && dir.entropyBits >= 7.5;
}
