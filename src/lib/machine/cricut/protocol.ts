/**
 * Cricut Explore 3 protocol — Phase 2, BLOCKED ON CAPTURE DATA.
 *
 * As of now there is no public documentation of the Explore 3's USB protocol,
 * and captures of the related Maker look possibly encrypted. Until we analyse a
 * real capture (see docs/cricut-explore3.md and ./capture.ts) we do NOT know the
 * frame format, so this module deliberately cannot produce bytes to send to a
 * machine. That is a safety decision: per every USB-RE guide, sending guessed
 * commands to a cutter can crash the head or damage the machine.
 *
 * When the capture is decoded, implement `CricutEncoder` here (plan → frames)
 * and add a binary transport; the rest of the app already targets the editor's
 * document model, so only this file and the transport need to change.
 */

import type { CutPlan } from "@/lib/doc/cutPlan";

/** USB identity to confirm against `lsusb` / the Windows descriptor dump. */
export interface CricutUsbId {
  vendorId: number;
  productId: number;
}

/** Observed on a Cricut Maker; UNVERIFIED for the Explore 3 — confirm per unit. */
export const KNOWN_CRICUT_IDS: readonly CricutUsbId[] = [{ vendorId: 0x20d3, productId: 0x0015 }];

export class ProtocolNotReverseEngineeredError extends Error {
  constructor() {
    super(
      "The Cricut Explore 3 cut protocol has not been reverse-engineered yet. " +
        "Capture a Design Space → Explore 3 USB session (see docs/cricut-explore3.md), " +
        "analyse it with the capture toolkit, then implement the encoder here.",
    );
    this.name = "ProtocolNotReverseEngineeredError";
  }
}

/** Encode a cut plan into the machine's native frames. Not yet implementable. */
export interface CricutEncoder {
  encode(plan: CutPlan): Uint8Array[];
}

/**
 * The only encoder we can honestly ship today: it refuses, loudly, so nothing
 * can accidentally stream improvised bytes to real hardware.
 */
export const inertEncoder: CricutEncoder = {
  encode() {
    throw new ProtocolNotReverseEngineeredError();
  },
};
