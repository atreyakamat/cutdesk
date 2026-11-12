/**
 * Bluetooth explorer: connect to any BLE device and list what it offers, so you
 * can see how a Cricut (or any cutter) talks before writing a driver for it.
 * It only reads and listens. It never writes to the device.
 *
 * Web Bluetooth only lets a page touch services it names up front, so the scan
 * covers the standard services plus any UUIDs you pass in. To find a machine's
 * own service UUIDs, look at it once in a phone app such as nRF Connect.
 */

import { COMMON_SERVICES, UART_PROFILES, toHex } from "./profiles";

export interface CharInfo {
  uuid: string;
  properties: string[];
  /** Hex of the current value when the characteristic is readable. */
  value?: string;
  readError?: string;
}

export interface ServiceInfo {
  uuid: string;
  label?: string;
  characteristics: CharInfo[];
}

export interface ExploreResult {
  deviceName: string;
  services: ServiceInfo[];
  /** Notification frames heard while listening, as capture-log lines ("rx 0a 0b …"). */
  frames: string[];
}

function propertyNames(p: BluetoothCharacteristicProperties): string[] {
  const names: string[] = [];
  if (p.read) names.push("read");
  if (p.write) names.push("write");
  if (p.writeWithoutResponse) names.push("write-no-response");
  if (p.notify) names.push("notify");
  if (p.indicate) names.push("indicate");
  if (p.broadcast) names.push("broadcast");
  return names;
}

/**
 * @param extraServices 128-bit UUIDs to look for besides the standard ones
 * @param listenMs how long to listen for notifications (0 = don't subscribe)
 */
export async function exploreDevice(extraServices: string[] = [], listenMs = 3000): Promise<ExploreResult> {
  const bluetooth = typeof navigator !== "undefined" ? navigator.bluetooth : undefined;
  if (!bluetooth) throw new Error("Web Bluetooth isn't available. Use Chrome or Edge over HTTPS or localhost.");

  const labels = new Map<string, string>([
    ...COMMON_SERVICES.map((s) => [s.uuid, s.label] as const),
    ...UART_PROFILES.map((p) => [p.service, p.label] as const),
  ]);
  const wanted = [...new Set([...labels.keys(), ...extraServices])];

  const device = await bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: wanted });
  if (!device.gatt) throw new Error("That device doesn't expose a Bluetooth GATT server.");
  const server = await device.gatt.connect();

  const services: ServiceInfo[] = [];
  const frames: string[] = [];
  const listeners: Array<{ ch: BluetoothRemoteGATTCharacteristic; fn: (e: Event) => void }> = [];

  try {
    for (const svc of await server.getPrimaryServices()) {
      const info: ServiceInfo = { uuid: svc.uuid, label: labels.get(svc.uuid.toLowerCase()), characteristics: [] };
      for (const ch of await svc.getCharacteristics()) {
        const c: CharInfo = { uuid: ch.uuid, properties: propertyNames(ch.properties) };
        if (ch.properties.read) {
          try {
            const v = await ch.readValue();
            c.value = toHex(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
          } catch (err) {
            c.readError = err instanceof Error ? err.message : "read failed";
          }
        }
        if (listenMs > 0 && (ch.properties.notify || ch.properties.indicate)) {
          const fn = (e: Event) => {
            const v = (e.target as BluetoothRemoteGATTCharacteristic).value;
            if (v) frames.push(`rx ${toHex(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))}`);
          };
          try {
            ch.addEventListener("characteristicvaluechanged", fn);
            await ch.startNotifications();
            listeners.push({ ch, fn });
          } catch {
            ch.removeEventListener("characteristicvaluechanged", fn);
          }
        }
        info.characteristics.push(c);
      }
      services.push(info);
    }
    if (listeners.length > 0) await new Promise((r) => setTimeout(r, listenMs));
  } finally {
    for (const { ch, fn } of listeners) {
      ch.removeEventListener("characteristicvaluechanged", fn);
      try {
        await ch.stopNotifications();
      } catch {
        // device already gone
      }
    }
    server.disconnect();
  }

  return { deviceName: device.name ?? "unnamed device", services, frames };
}

/** Plain-text report for the log or a bug report. */
export function formatExploreReport(r: ExploreResult): string[] {
  const lines = [`Device: ${r.deviceName}`];
  if (r.services.length === 0) {
    lines.push("No services were visible. The device may use services you haven't listed (see the note under the box).");
  }
  for (const s of r.services) {
    lines.push(`Service ${s.uuid}${s.label ? ` (${s.label})` : ""}`);
    for (const c of s.characteristics) {
      lines.push(`  ${c.uuid}  [${c.properties.join(", ") || "no access"}]${c.value ? `  = ${c.value}` : ""}${c.readError ? `  (${c.readError})` : ""}`);
    }
  }
  if (r.frames.length) lines.push(`Heard ${r.frames.length} notification(s); copy the capture to analyse it.`);
  return lines;
}
