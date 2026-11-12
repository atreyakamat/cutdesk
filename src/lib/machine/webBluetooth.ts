/**
 * Web Bluetooth transport: a wireless (BLE) connection to a cutter that speaks a
 * GRBL-style line protocol through a UART-over-GATT service — an open-firmware
 * cutter, or any machine with an ESP32 / HM-10 style BLE adapter.
 *
 * It is NOT a driver for stock Cricut firmware. Those machines speak a
 * proprietary protocol; use the explorer (ble/explore.ts) to see what a device
 * offers. Chromium-only, needs HTTPS or localhost, and prompts the user to pick
 * the device. On Linux it needs BlueZ.
 */

import { chunkBytes, pickProfile, UART_PROFILES, type UartProfile } from "./ble/profiles";
import { DataEmitter, delay, type Transport } from "./transport";

/** BLE's default ATT payload is 20 bytes; a larger negotiated MTU is not visible to the page. */
const CHUNK = 20;
/** Breathing room between writes so cheap adapters don't drop bytes. */
const WRITE_GAP_MS = 8;

export class WebBluetoothTransport implements Transport {
  readonly name = "Bluetooth (BLE)";
  private emitter = new DataEmitter();
  private device: BluetoothDevice | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private open = false;
  private queue: Promise<void> = Promise.resolve();
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.bluetooth;
  }

  get connected(): boolean {
    return this.open;
  }

  /** Name of the connected device, for the log. */
  get deviceName(): string {
    return this.device?.name ?? "unnamed device";
  }

  async connect(): Promise<void> {
    const bluetooth = typeof navigator !== "undefined" ? navigator.bluetooth : undefined;
    if (!bluetooth) {
      throw new Error("Web Bluetooth isn't available. Use Chrome or Edge over HTTPS or localhost (Firefox and Safari don't support it).");
    }
    const services = UART_PROFILES.map((p) => p.service);
    const device = await bluetooth.requestDevice({
      filters: services.map((s) => ({ services: [s] })),
      optionalServices: services,
    });
    if (!device.gatt) throw new Error("That device doesn't expose a Bluetooth GATT server.");

    const server = await device.gatt.connect();
    let profile: UartProfile | null = null;
    let service: BluetoothRemoteGATTService | null = null;
    try {
      const found = await server.getPrimaryServices();
      profile = pickProfile(found.map((s) => s.uuid));
      service = profile ? (found.find((s) => s.uuid.toLowerCase() === profile!.service) ?? null) : null;
    } catch {
      // fall through to the error below
    }
    if (!profile || !service) {
      server.disconnect();
      throw new Error("This device has no serial-over-Bluetooth service (Nordic UART or HM-10). Stock Cricut machines don't offer one.");
    }

    try {
      this.writeChar = await service.getCharacteristic(profile.write);
      this.notifyChar = profile.notify === profile.write ? this.writeChar : await service.getCharacteristic(profile.notify);
      this.notifyChar.addEventListener("characteristicvaluechanged", this.onNotify);
      await this.notifyChar.startNotifications();
    } catch (err) {
      server.disconnect();
      throw new Error(`Couldn't open the serial channel: ${err instanceof Error ? err.message : "unknown error"}`);
    }

    device.addEventListener("gattserverdisconnected", this.onDisconnected);
    this.device = device;
    this.open = true;
  }

  private onNotify = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic | null)?.value;
    if (!value) return;
    this.emitter.emit(this.decoder.decode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), { stream: true }));
  };

  private onDisconnected = (): void => {
    this.open = false;
    this.emitter.emit("; Bluetooth connection lost\n");
  };

  subscribe(onData: (chunk: string) => void): () => void {
    return this.emitter.subscribe(onData);
  }

  /** Writes are queued so lines stay in order and chunks never interleave. */
  send(text: string): Promise<void> {
    const job = this.queue.then(() => this.write(text));
    this.queue = job.catch(() => undefined);
    return job;
  }

  private async write(text: string): Promise<void> {
    const ch = this.writeChar;
    if (!this.open || !ch) throw new Error("Bluetooth isn't connected.");
    for (const piece of chunkBytes(this.encoder.encode(text), CHUNK)) {
      if (!this.open) throw new Error("Bluetooth connection lost.");
      if (ch.properties.writeWithoutResponse) await ch.writeValueWithoutResponse(piece);
      else await ch.writeValueWithResponse(piece);
      await delay(WRITE_GAP_MS);
    }
  }

  async disconnect(): Promise<void> {
    this.open = false;
    this.emitter.clear();
    try {
      this.notifyChar?.removeEventListener("characteristicvaluechanged", this.onNotify);
      await this.notifyChar?.stopNotifications();
    } catch {
      // already gone
    }
    this.device?.removeEventListener("gattserverdisconnected", this.onDisconnected);
    try {
      this.device?.gatt?.disconnect();
    } catch {
      // already gone
    }
    this.device = null;
    this.writeChar = null;
    this.notifyChar = null;
  }
}
