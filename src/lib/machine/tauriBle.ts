/**
 * Native Bluetooth (BLE) transport for the Tauri desktop build. Calls the Rust
 * commands in src-tauri/src/ble.rs, which talk to the OS Bluetooth stack
 * (BlueZ on Linux). Unlike Web Bluetooth it needs no Chromium and no HTTPS, and
 * its explorer can see every service a device has.
 *
 * Drives GRBL-style cutters with a Nordic UART or HM-10 serial-over-GATT
 * service. It is not a driver for stock Cricut firmware (private protocol).
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { DataEmitter, type Transport } from "./transport";
import type { NativePort } from "./tauriSerial";

export interface NativeBleChar {
  uuid: string;
  properties: string[];
  value: string | null;
  read_error: string | null;
}

export interface NativeBleService {
  uuid: string;
  characteristics: NativeBleChar[];
}

export interface NativeExploreResult {
  device_name: string;
  services: NativeBleService[];
  /** Notifications heard, as capture-log lines ("rx 0a 0b …"). */
  frames: string[];
}

interface ScanDevice {
  id: string;
  name: string;
  rssi: number | null;
}

/** Turn a native explore result into plain report lines for the log. */
export function formatNativeExplore(r: NativeExploreResult): string[] {
  const lines = [`Device: ${r.device_name}`];
  if (r.services.length === 0) lines.push("No services were visible.");
  for (const s of r.services) {
    lines.push(`Service ${s.uuid}`);
    for (const c of s.characteristics) {
      lines.push(`  ${c.uuid}  [${c.properties.join(", ") || "no access"}]${c.value ? `  = ${c.value}` : ""}${c.read_error ? `  (${c.read_error})` : ""}`);
    }
  }
  if (r.frames.length) lines.push(`Heard ${r.frames.length} notification(s); copy the capture to analyse it.`);
  return lines;
}

export class TauriBleTransport implements Transport {
  readonly name = "Bluetooth (desktop)";
  private emitter = new DataEmitter();
  private open = false;
  private unlisteners: UnlistenFn[] = [];

  constructor(private readonly deviceId: string) {}

  /** Scan for nearby devices. Takes a few seconds. */
  static async scan(timeoutMs = 4000): Promise<NativePort[]> {
    const found = await invoke<ScanDevice[]>("ble_scan", { timeoutMs });
    return found.map((d) => ({ path: d.id, label: d.rssi === null ? d.name : `${d.name} (${d.rssi} dBm)` }));
  }

  /** Read-only: lists every service, reads what's readable, listens briefly. Never writes. */
  static explore(deviceId: string, listenMs = 3000): Promise<NativeExploreResult> {
    return invoke<NativeExploreResult>("ble_explore", { id: deviceId, listenMs });
  }

  get connected(): boolean {
    return this.open;
  }

  async connect(): Promise<void> {
    this.unlisteners = [
      await listen<string>("ble-data", (e) => this.emitter.emit(e.payload)),
      await listen("ble-disconnected", () => {
        this.open = false;
        this.emitter.emit("; Bluetooth connection lost\n");
      }),
    ];
    try {
      await invoke<string>("ble_connect", { id: this.deviceId });
      this.open = true;
    } catch (err) {
      this.detach();
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  subscribe(onData: (chunk: string) => void): () => void {
    return this.emitter.subscribe(onData);
  }

  async send(text: string): Promise<void> {
    if (!this.open) throw new Error("Bluetooth isn't connected.");
    try {
      await invoke("ble_write", { data: text });
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  async disconnect(): Promise<void> {
    this.open = false;
    try {
      await invoke("ble_disconnect");
    } catch {
      // already closed
    }
    this.detach();
    this.emitter.clear();
  }

  private detach(): void {
    for (const un of this.unlisteners) un();
    this.unlisteners = [];
  }
}
