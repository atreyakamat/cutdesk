/**
 * A transport is a bidirectional text pipe to a cutting machine that speaks a
 * GRBL-style line protocol. The editor only ever sees this interface, so the
 * same G-code streamer drives a USB device (Web Serial), a local bridge server
 * (the Bluetooth / background workaround), or an in-browser simulator — and a
 * native desktop build can add its own transport without touching anything else.
 */

export type LogDir = "tx" | "rx" | "info" | "error";

export interface Transport {
  readonly name: string;
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Write raw text (already newline-terminated by the caller). */
  send(text: string): Promise<void>;
  /** Subscribe to incoming text. Returns an unsubscribe function. */
  subscribe(onData: (chunk: string) => void): () => void;
}

/** Fan-out helper so the UI log and the streamer can both read the stream. */
export class DataEmitter {
  private listeners = new Set<(chunk: string) => void>();
  subscribe(onData: (chunk: string) => void): () => void {
    this.listeners.add(onData);
    return () => {
      this.listeners.delete(onData);
    };
  }
  emit(chunk: string): void {
    for (const listener of this.listeners) listener(chunk);
  }
  clear(): void {
    this.listeners.clear();
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
