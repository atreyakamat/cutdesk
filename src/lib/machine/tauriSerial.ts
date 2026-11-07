/**
 * Native serial transport for the Tauri desktop build. Calls the Rust commands
 * in src-tauri/src/lib.rs, so it reaches wired USB and Bluetooth-as-serial
 * devices with no browser sandbox — the same Transport interface as the others.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { DataEmitter, type Transport } from "./transport";

export function isTauri(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

export interface NativePort {
  path: string;
  label: string;
}

export class TauriSerialTransport implements Transport {
  readonly name = "Desktop (native)";
  private emitter = new DataEmitter();
  private open = false;
  private unlisten: UnlistenFn | null = null;

  constructor(
    private readonly path: string,
    private readonly baud = 115200,
  ) {}

  static listPorts(): Promise<NativePort[]> {
    return invoke<NativePort[]>("list_serial_ports");
  }

  get connected(): boolean {
    return this.open;
  }

  async connect(): Promise<void> {
    this.unlisten = await listen<string>("serial-data", (event) => this.emitter.emit(event.payload));
    try {
      await invoke("open_serial", { path: this.path, baud: this.baud });
      this.open = true;
    } catch (err) {
      this.unlisten?.();
      this.unlisten = null;
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  subscribe(onData: (chunk: string) => void): () => void {
    return this.emitter.subscribe(onData);
  }

  async send(text: string): Promise<void> {
    await invoke("write_serial", { data: text });
  }

  async disconnect(): Promise<void> {
    this.open = false;
    try {
      await invoke("close_serial");
    } catch {
      // already closed
    }
    this.unlisten?.();
    this.unlisten = null;
    this.emitter.clear();
  }
}
