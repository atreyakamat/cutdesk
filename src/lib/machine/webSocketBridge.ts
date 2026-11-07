/**
 * Bridge transport: talks to the local CutDesk bridge server (bridge/server.mjs)
 * over a WebSocket. The bridge owns the real serial port, which is how this path
 * reaches machines the browser can't touch directly:
 *   - Bluetooth: a paired Cricut/cutter shows up as a serial port (COMx, or
 *     /dev/rfcomm0 / /dev/tty.* after pairing) that the bridge opens.
 *   - A persistent, background connection independent of a single tab.
 */

import { DataEmitter, type Transport } from "./transport";

export interface BridgePort {
  path: string;
  label: string;
}

type ServerMessage =
  | { type: "ports"; ports: BridgePort[] }
  | { type: "open-ok" }
  | { type: "data"; data: string }
  | { type: "error"; message: string }
  | { type: "closed" };

function parse(raw: unknown): ServerMessage | null {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as ServerMessage;
  } catch {
    return null;
  }
}

export class WebSocketBridgeTransport implements Transport {
  readonly name = "Bridge";
  private emitter = new DataEmitter();
  private ws: WebSocket | null = null;
  private open = false;

  constructor(
    private readonly url: string,
    private readonly port: string,
    private readonly baudRate = 115200,
  ) {}

  get connected(): boolean {
    return this.open;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onopen = () => ws.send(JSON.stringify({ type: "open", port: this.port, baud: this.baudRate }));
      ws.onmessage = (event: MessageEvent) => {
        const msg = parse(event.data);
        if (!msg) return;
        if (msg.type === "data") this.emitter.emit(msg.data);
        else if (msg.type === "open-ok") {
          this.open = true;
          if (!settled) {
            settled = true;
            resolve();
          }
        } else if (msg.type === "error") {
          this.emitter.emit(`; bridge error: ${msg.message}\n`);
          if (!settled) {
            settled = true;
            reject(new Error(msg.message));
          }
        }
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error(`Couldn't reach the bridge at ${this.url}. Is it running?`));
        }
      };
      ws.onclose = () => {
        this.open = false;
      };
    });
  }

  subscribe(onData: (chunk: string) => void): () => void {
    return this.emitter.subscribe(onData);
  }

  async send(text: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("Bridge isn't connected.");
    this.ws.send(JSON.stringify({ type: "data", data: text }));
  }

  async disconnect(): Promise<void> {
    try {
      this.ws?.send(JSON.stringify({ type: "close" }));
    } catch {
      // socket already gone
    }
    this.ws?.close();
    this.ws = null;
    this.open = false;
    this.emitter.clear();
  }

  /** Ask a bridge for its available serial ports without opening one. */
  static listPorts(url: string, timeoutMs = 4000): Promise<BridgePort[]> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws.close();
          reject(new Error(`Couldn't reach the bridge at ${url}. Is it running?`));
        }
      }, timeoutMs);
      ws.onopen = () => ws.send(JSON.stringify({ type: "list" }));
      ws.onmessage = (event: MessageEvent) => {
        const msg = parse(event.data);
        if (msg?.type === "ports" && !settled) {
          settled = true;
          clearTimeout(timer);
          ws.close();
          resolve(msg.ports);
        }
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`Couldn't reach the bridge at ${url}. Is it running?`));
        }
      };
    });
  }
}
