/**
 * Safe-replay preparation for Phase 2. The FIRST thing we'll ever send to a real
 * Explore 3 is not synthesised geometry — it's the exact host→device bytes that
 * Cricut Design Space itself sent during a captured job (see ./capture.ts). If
 * the machine behaves identically, we've confirmed the capture and the transport
 * before risking any guessed command.
 *
 * This module only *prepares and vets* that byte sequence; it has no transport
 * and touches no hardware. Sending is the binary transport's job (added once the
 * descriptors tell us CDC-serial vs raw-bulk), and it will refuse anything this
 * function hasn't blessed.
 */

import type { CaptureFrame } from "./capture";

export interface ReplayPlan {
  /** Host→device frames, in capture order — the only thing allowed to be sent. */
  frames: Uint8Array[];
  totalBytes: number;
  maxFrameBytes: number;
}

export class UnsafeReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeReplayError";
  }
}

export interface ReplayOptions {
  /** Reject the plan if any single frame is larger than this (a malformed capture). */
  maxFrameBytes?: number;
  /** Reject the plan if the whole replay is larger than this. */
  maxTotalBytes?: number;
}

/**
 * Turn captured frames into a vetted replay plan: keep only the host→device
 * (tx) frames, in order, and refuse anything implausibly large so a corrupt
 * capture can't be streamed at the machine.
 */
export function buildReplayPlan(frames: CaptureFrame[], opts: ReplayOptions = {}): ReplayPlan {
  const maxFrame = opts.maxFrameBytes ?? 65536;
  const maxTotal = opts.maxTotalBytes ?? 8_000_000;

  const tx = frames.filter((f) => f.dir === "tx").map((f) => f.bytes);
  if (tx.length === 0) throw new UnsafeReplayError("This capture has no host→device frames to replay.");

  let totalBytes = 0;
  let maxFrameBytes = 0;
  for (const b of tx) {
    totalBytes += b.length;
    if (b.length > maxFrameBytes) maxFrameBytes = b.length;
  }
  if (maxFrameBytes > maxFrame) {
    throw new UnsafeReplayError(`A frame is ${maxFrameBytes} bytes, over the ${maxFrame}-byte safety limit — refusing to replay.`);
  }
  if (totalBytes > maxTotal) {
    throw new UnsafeReplayError(`This replay is ${totalBytes} bytes, over the ${maxTotal}-byte safety limit — refusing to replay.`);
  }

  return { frames: tx, totalBytes, maxFrameBytes };
}
