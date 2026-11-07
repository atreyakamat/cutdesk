/**
 * A fake GRBL device that lives in the browser, so the whole send pipeline can
 * be exercised with no hardware: it prints a startup banner and answers every
 * non-empty line with "ok" after a short, length-aware delay.
 */

import { DataEmitter, delay, type Transport } from "./transport";

export class SimulatorTransport implements Transport {
  readonly name = "Simulator";
  private emitter = new DataEmitter();
  private open = false;

  get connected(): boolean {
    return this.open;
  }

  async connect(): Promise<void> {
    this.open = true;
    await delay(40);
    this.emitter.emit("Grbl 1.1h ['$' for help]\r\n");
  }

  async disconnect(): Promise<void> {
    this.open = false;
    this.emitter.clear();
  }

  subscribe(onData: (chunk: string) => void): () => void {
    return this.emitter.subscribe(onData);
  }

  async send(text: string): Promise<void> {
    if (!this.open) throw new Error("Simulator is not connected.");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      // A tiny delay keeps the progress bar and console readable.
      await delay(line.startsWith("G1") || line.startsWith("G0") ? 6 : 3);
      this.emitter.emit("ok\r\n");
    }
  }
}
