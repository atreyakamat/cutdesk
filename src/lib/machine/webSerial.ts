/**
 * Web Serial transport: a direct USB (wired) connection to a cutter that speaks
 * a serial line protocol — a Cricut Maker running CutcutGo/GRBL, or any GRBL or
 * HPGL/GPGL open cutter. Chromium-only, needs HTTPS or localhost, and prompts
 * the user to pick the port.
 */

import { DataEmitter, type Transport } from "./transport";

export class WebSerialTransport implements Transport {
  readonly name = "USB (Web Serial)";
  private emitter = new DataEmitter();
  private port: SerialPort | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private open = false;
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();

  constructor(private readonly baudRate = 115200) {}

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.serial;
  }

  get connected(): boolean {
    return this.open;
  }

  async connect(): Promise<void> {
    if (!navigator.serial) throw new Error("Web Serial isn't available. Use Chrome or Edge over HTTPS or localhost.");
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: this.baudRate });
    this.open = true;
    if (this.port.writable) this.writer = this.port.writable.getWriter();
    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    if (!this.port?.readable) return;
    this.reader = this.port.readable.getReader();
    try {
      while (this.open) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.emitter.emit(this.decoder.decode(value));
      }
    } catch {
      // Reader cancelled on disconnect, or the device went away.
    } finally {
      try {
        this.reader.releaseLock();
      } catch {
        // already released
      }
    }
  }

  subscribe(onData: (chunk: string) => void): () => void {
    return this.emitter.subscribe(onData);
  }

  async send(text: string): Promise<void> {
    if (!this.writer) throw new Error("Serial port isn't connected.");
    await this.writer.write(this.encoder.encode(text));
  }

  async disconnect(): Promise<void> {
    this.open = false;
    try {
      await this.reader?.cancel();
    } catch {
      // ignore
    }
    try {
      this.writer?.releaseLock();
    } catch {
      // ignore
    }
    try {
      await this.port?.close();
    } catch {
      // ignore
    }
    this.emitter.clear();
    this.port = null;
    this.writer = null;
    this.reader = null;
  }
}
