/**
 * Streams G-code to a transport using GRBL's simple send-response protocol:
 * send one line, wait for "ok" (or "error…"), then send the next. Supports
 * pause, resume and stop, and reports progress and a transmit log.
 *
 * Incoming text is read by the UI separately (for the console); here we only
 * watch for the acknowledgement so we never run ahead of the machine's buffer.
 */

import { delay, type LogDir, type Transport } from "./transport";

export interface StreamCallbacks {
  onProgress?: (sent: number, total: number) => void;
  onLog?: (dir: LogDir, text: string) => void;
}

export interface StreamResult {
  sent: number;
  total: number;
  stopped: boolean;
}

/** Strip a trailing `;` comment and surrounding whitespace; drop empty lines. */
function clean(line: string): string {
  const semi = line.indexOf(";");
  return (semi >= 0 ? line.slice(0, semi) : line).trim();
}

const ACK_TIMEOUT_MS = 20000;

export class GcodeStreamer {
  private paused = false;
  private stopped = false;
  private ackResolver: ((result: "ok" | "error") => void) | null = null;
  private rxBuffer = "";
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly transport: Transport) {}

  get running(): boolean {
    return this.unsubscribe !== null;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  stop(): void {
    this.stopped = true;
    // Release any pending wait so the loop can exit promptly.
    this.ackResolver?.("ok");
  }

  private handleIncoming(chunk: string): void {
    this.rxBuffer += chunk;
    let nl: number;
    while ((nl = this.rxBuffer.indexOf("\n")) >= 0) {
      const line = this.rxBuffer.slice(0, nl).replace(/\r$/, "").trim();
      this.rxBuffer = this.rxBuffer.slice(nl + 1);
      if (!line) continue;
      const lower = line.toLowerCase();
      if (lower === "ok") this.ackResolver?.("ok");
      else if (lower.startsWith("error")) this.ackResolver?.("error");
    }
  }

  async run(gcode: string, cb: StreamCallbacks = {}): Promise<StreamResult> {
    const lines = gcode.split("\n").map(clean).filter((l) => l.length > 0);
    const total = lines.length;
    this.stopped = false;
    this.paused = false;
    this.rxBuffer = "";
    this.unsubscribe = this.transport.subscribe((c) => this.handleIncoming(c));

    let sent = 0;
    try {
      for (const line of lines) {
        if (this.stopped) break;
        while (this.paused && !this.stopped) await delay(100);
        if (this.stopped) break;

        const ack = new Promise<"ok" | "error">((resolve) => {
          this.ackResolver = resolve;
        });
        cb.onLog?.("tx", line);
        await this.transport.send(line + "\n");

        const result = await Promise.race([ack, delay(ACK_TIMEOUT_MS).then(() => "timeout" as const)]);
        this.ackResolver = null;
        if (result === "timeout") cb.onLog?.("error", `No "ok" after ${ACK_TIMEOUT_MS / 1000}s — continuing.`);
        else if (result === "error") cb.onLog?.("error", `Machine reported an error on: ${line}`);

        sent += 1;
        cb.onProgress?.(sent, total);
      }
    } finally {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.ackResolver = null;
    }

    return { sent, total, stopped: this.stopped };
  }
}
