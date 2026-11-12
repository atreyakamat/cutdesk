/**
 * Bluetooth Low Energy "serial over GATT" profiles, plus the small pure helpers
 * the transport needs. Nothing here touches the Bluetooth API, so it is all
 * unit-testable.
 *
 * BLE has no serial port. A cutter (or a BLE-to-UART adapter on its board) shows
 * a GATT service with one characteristic we write to and one that notifies us.
 * These are the common layouts for GRBL-style open cutters and ESP32/HM-10 modules.
 */

export interface UartProfile {
  id: string;
  label: string;
  /** 128-bit service UUID, lower case. */
  service: string;
  /** We write G-code here. */
  write: string;
  /** The machine's replies arrive here as notifications. */
  notify: string;
}

const base16 = (short: string) => `0000${short}-0000-1000-8000-00805f9b34fb`;

export const UART_PROFILES: readonly UartProfile[] = [
  {
    id: "nus",
    label: "Nordic UART (ESP32, nRF52, most BLE GRBL boards)",
    service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    write: "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
    notify: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
  },
  {
    id: "ffe0",
    label: "HM-10 / JDY style (one shared characteristic)",
    service: base16("ffe0"),
    write: base16("ffe1"),
    notify: base16("ffe1"),
  },
];

/** Standard services worth listing when exploring an unknown device. */
export const COMMON_SERVICES: readonly { uuid: string; label: string }[] = [
  { uuid: base16("1800"), label: "Generic Access" },
  { uuid: base16("1801"), label: "Generic Attribute" },
  { uuid: base16("180a"), label: "Device Information" },
  { uuid: base16("180f"), label: "Battery" },
];

/** Lower-case a UUID and expand a 16-bit one ("FFE0" or "0xffe0") to 128 bits. Returns null if it isn't a UUID. */
export function normalizeUuid(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/^0x/, "");
  if (/^[0-9a-f]{4}$/.test(s)) return base16(s);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) return s;
  return null;
}

/** Parse "ffe0, 6e400001-…" into valid 128-bit UUIDs, dropping anything malformed. */
export function parseUuidList(text: string): { uuids: string[]; rejected: string[] } {
  const uuids: string[] = [];
  const rejected: string[] = [];
  for (const part of text.split(/[\s,;]+/).filter(Boolean)) {
    const u = normalizeUuid(part);
    if (u) {
      if (!uuids.includes(u)) uuids.push(u);
    } else {
      rejected.push(part);
    }
  }
  return { uuids, rejected };
}

/** The first known profile whose service the device offers. */
export function pickProfile(serviceUuids: readonly string[]): UartProfile | null {
  const have = new Set(serviceUuids.map((u) => u.toLowerCase()));
  return UART_PROFILES.find((p) => have.has(p.service)) ?? null;
}

/** Split bytes into pieces no longer than `size` (BLE's default payload is 20 bytes). */
export function chunkBytes(bytes: Uint8Array, size: number): Uint8Array<ArrayBuffer>[] {
  const n = Math.max(1, Math.floor(size));
  const out: Uint8Array<ArrayBuffer>[] = [];
  for (let i = 0; i < bytes.length; i += n) out.push(bytes.slice(i, i + n));
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
}
