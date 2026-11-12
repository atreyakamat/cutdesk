"use client";

import { Dialog } from "radix-ui";
import { ClipboardCopy, Download, Pause, Play, Plug, RefreshCw, Search, Send, Square, Usb, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { downloadFile } from "@/lib/files";
import { slugify } from "@/lib/doc/svg";
import { generateGcode } from "@/lib/machine/gcode";
import { GcodeStreamer } from "@/lib/machine/streamer";
import { SimulatorTransport } from "@/lib/machine/simulator";
import { WebSerialTransport } from "@/lib/machine/webSerial";
import { WebSocketBridgeTransport, type BridgePort } from "@/lib/machine/webSocketBridge";
import { TauriSerialTransport, isTauri } from "@/lib/machine/tauriSerial";
import { TauriBleTransport, formatNativeExplore } from "@/lib/machine/tauriBle";
import type { LogDir, Transport } from "@/lib/machine/transport";
import { useEditor } from "@/store/editorStore";
import { Button } from "./ui/Controls";

type Kind = "sim" | "serial" | "bridge" | "tauri" | "tauri-ble";
interface LogLine {
  id: number;
  dir: LogDir;
  text: string;
}

const DEFAULT_BRIDGE_URL = "ws://127.0.0.1:8787";

const MODE_HELP: Record<Kind, string> = {
  sim: "Dry-run the cut order in the browser — no machine needed.",
  serial: "Plug the machine in over USB and connect (Chrome or Edge).",
  bridge: "Connect through the local bridge server — covers USB and paired Bluetooth.",
  tauri: "Use the desktop app's built-in native USB connection.",
  "tauri-ble":
    "Wireless through the desktop app's own Bluetooth, no browser limits. Works with cutters that have a Bluetooth serial adapter (Nordic UART or HM-10). Stock Cricut machines use a private protocol and won't connect; Explore shows everything yours offers.",
};

const LOG_COLOR: Record<LogDir, string> = {
  tx: "text-ink",
  rx: "text-ink-faint",
  info: "text-score",
  error: "text-blade",
};

export function SendDialog() {
  const doc = useEditor((s) => s.doc);

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("sim");
  const [baud, setBaud] = useState(115200);
  const [bridgeUrl, setBridgeUrl] = useState(DEFAULT_BRIDGE_URL);
  const [ports, setPorts] = useState<BridgePort[]>([]);
  const [port, setPort] = useState("");
  const [exploring, setExploring] = useState(false);
  const bleFrames = useRef<string[]>([]);

  const [feed, setFeed] = useState(1000);
  const [travelFeed, setTravelFeed] = useState(2000);
  const [flipY, setFlipY] = useState(true);

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);

  const transportRef = useRef<Transport | null>(null);
  const streamerRef = useRef<GcodeStreamer | null>(null);
  const logId = useRef(0);

  const result = useMemo(() => generateGcode(doc, { feed, travelFeed, flipY }), [doc, feed, travelFeed, flipY]);
  const serialSupported = WebSerialTransport.isSupported();
  const inTauri = isTauri();

  const addLog = (dir: LogDir, text: string) =>
    setLog((prev) => [...prev.slice(-250), { id: logId.current++, dir, text }]);

  const resetConnection = () => {
    streamerRef.current?.stop();
    streamerRef.current = null;
    void transportRef.current?.disconnect();
    transportRef.current = null;
    setConnected(false);
    setSending(false);
    setPaused(false);
    setProgress(null);
  };

  const refreshPorts = async () => {
    addLog("info", kind === "tauri-ble" ? "Scanning for Bluetooth devices (about 4 seconds)…" : kind === "tauri" ? "Listing native serial ports…" : `Listing ports from ${bridgeUrl}…`);
    try {
      const found =
        kind === "tauri-ble"
          ? await TauriBleTransport.scan()
          : kind === "tauri"
            ? await TauriSerialTransport.listPorts()
            : await WebSocketBridgeTransport.listPorts(bridgeUrl);
      setPorts(found);
      if (found[0] && !port) setPort(found[0].path);
      addLog("info", found.length ? `Found ${found.length} ${kind === "tauri-ble" ? "device(s)" : "port(s)"}.` : kind === "tauri-ble" ? "No Bluetooth devices found. Is the cutter on, and Bluetooth switched on?" : "No ports found.");
    } catch (err) {
      addLog("error", err instanceof Error ? err.message : "Couldn't list ports.");
    }
  };

  const buildTransport = (): Transport => {
    if (kind === "serial") return new WebSerialTransport(baud);
    if (kind === "bridge") return new WebSocketBridgeTransport(bridgeUrl, port, baud);
    if (kind === "tauri") return new TauriSerialTransport(port, baud);
    if (kind === "tauri-ble") return new TauriBleTransport(port);
    return new SimulatorTransport();
  };

  const explore = async () => {
    if (!port) {
      addLog("error", "Pick a device first (Scan).");
      return;
    }
    setExploring(true);
    addLog("info", "Exploring. This only reads and listens; nothing is written to the device.");
    try {
      const result = await TauriBleTransport.explore(port);
      bleFrames.current = result.frames;
      for (const line of formatNativeExplore(result)) addLog("info", line);
    } catch (err) {
      addLog("error", err instanceof Error ? err.message : String(err));
    } finally {
      setExploring(false);
    }
  };

  const copyCapture = async () => {
    try {
      await navigator.clipboard.writeText(bleFrames.current.join("\n"));
      addLog("info", "Copied. Paste it into the Cricut capture analyser.");
    } catch {
      addLog("error", "Couldn't copy to the clipboard.");
    }
  };

  const connect = async () => {
    if ((kind === "bridge" || kind === "tauri" || kind === "tauri-ble") && !port) {
      addLog("error", kind === "tauri-ble" ? "Pick a device first (Scan)." : "Pick a port first (Refresh ports).");
      return;
    }
    setConnecting(true);
    try {
      const transport = buildTransport();
      transport.subscribe((chunk) => {
        for (const part of chunk.split("\n")) {
          const line = part.replace(/\r/g, "");
          if (line.trim()) addLog("rx", line);
        }
      });
      await transport.connect();
      transportRef.current = transport;
      setConnected(true);
      addLog("info", `Connected to ${transport.name}.`);
    } catch (err) {
      addLog("error", err instanceof Error ? err.message : "Connection failed.");
    } finally {
      setConnecting(false);
    }
  };

  const send = async () => {
    const transport = transportRef.current;
    if (!transport) return;
    const streamer = new GcodeStreamer(transport);
    streamerRef.current = streamer;
    setSending(true);
    setPaused(false);
    addLog("info", `Sending ${result.lineCount} lines…`);
    try {
      const res = await streamer.run(result.gcode, {
        onProgress: (sent, total) => setProgress({ sent, total }),
        onLog: (dir, text) => addLog(dir, text),
      });
      addLog("info", res.stopped ? "Stopped." : `Done — sent ${res.sent} lines.`);
    } catch (err) {
      addLog("error", err instanceof Error ? err.message : "Send failed.");
    } finally {
      setSending(false);
      setPaused(false);
      streamerRef.current = null;
    }
  };

  const togglePause = () => {
    const s = streamerRef.current;
    if (!s) return;
    if (paused) {
      s.resume();
      setPaused(false);
    } else {
      s.pause();
      setPaused(true);
    }
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) resetConnection();
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.sent / progress.total) * 100) : 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <Button variant="secondary" aria-label="Send the design to a cutting machine">
          <Usb className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Send</span>
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm" />
        <Dialog.Content
          className="pop-in fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-pop bg-panel shadow-pop outline-none"
          aria-describedby={undefined}
        >
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <Send className="size-4 text-ink-soft" aria-hidden="true" />
            <Dialog.Title className="font-display text-[15px] font-semibold tracking-tight">Send to machine</Dialog.Title>
            <Dialog.Close className="ml-auto grid size-7 place-items-center rounded-control text-ink-soft hover:bg-sunken" aria-label="Close">
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="scroll-thin flex flex-col gap-4 overflow-y-auto px-4 py-4">
            {/* Connection */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Connection</span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { k: "sim", label: "Simulator" },
                    { k: "serial", label: "USB" },
                    { k: "bridge", label: "Bridge (USB / Bluetooth)" },
                    ...(inTauri
                      ? [
                          { k: "tauri", label: "Desktop (native)" },
                          { k: "tauri-ble", label: "Bluetooth (desktop)" },
                        ]
                      : []),
                  ] as { k: Kind; label: string }[]
                ).map(({ k, label }) => (
                  <button
                    key={k}
                    type="button"
                    disabled={connected || sending}
                    onClick={() => {
                      setKind(k);
                      setPorts([]);
                      setPort("");
                    }}
                    className={`rounded-control border px-2.5 py-1.5 text-sm transition-colors disabled:opacity-45 ${
                      kind === k ? "border-ink bg-ink text-on-ink" : "border-line bg-raised text-ink hover:border-line-strong"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <p className="text-xs text-ink-soft">{MODE_HELP[kind]}</p>

              {kind === "serial" && !serialSupported && (
                <p className="text-xs text-blade">Web Serial needs Chrome or Edge over HTTPS or localhost.</p>
              )}

              {(kind === "bridge" || kind === "tauri" || kind === "tauri-ble") && (
                <div className="flex flex-col gap-2">
                  {kind === "bridge" && (
                    <input
                      value={bridgeUrl}
                      onChange={(e) => setBridgeUrl(e.target.value)}
                      disabled={connected}
                      aria-label="Bridge URL"
                      className="h-8 w-full rounded-control border border-line bg-raised px-2 font-mono text-xs disabled:opacity-45"
                    />
                  )}
                  <div className="flex items-center gap-1.5">
                    <select
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      disabled={connected}
                      aria-label={kind === "tauri-ble" ? "Bluetooth device" : "Serial port"}
                      className="h-8 min-w-0 flex-1 appearance-none truncate rounded-control border border-line bg-raised px-2 text-sm disabled:opacity-45"
                    >
                      {ports.length === 0 ? (
                        <option value="">{kind === "tauri-ble" ? "No devices — Scan" : "No ports — Refresh"}</option>
                      ) : (
                        ports.map((p) => (
                          <option key={p.path} value={p.path}>
                            {p.label}
                          </option>
                        ))
                      )}
                    </select>
                    <Button
                      variant="ghost"
                      onClick={() => void refreshPorts()}
                      disabled={connected || exploring}
                      aria-label={kind === "tauri-ble" ? "Scan for Bluetooth devices" : "Refresh ports"}
                    >
                      <RefreshCw className="size-3.5" aria-hidden="true" />
                    </Button>
                    {kind === "tauri-ble" && (
                      <>
                        <Button variant="ghost" onClick={() => void explore()} disabled={connected || exploring || !port}>
                          <Search className="size-3.5" aria-hidden="true" />
                          {exploring ? "Exploring…" : "Explore"}
                        </Button>
                        <Button variant="ghost" onClick={() => void copyCapture()} aria-label="Copy the notifications heard as a capture log">
                          <ClipboardCopy className="size-3.5" aria-hidden="true" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                {kind !== "sim" && kind !== "tauri-ble" && (
                  <label className="flex items-center gap-1.5 text-sm text-ink-soft">
                    Baud
                    <input
                      type="number"
                      value={baud}
                      onChange={(e) => setBaud(Number(e.target.value) || 115200)}
                      disabled={connected}
                      className="h-8 w-24 rounded-control border border-line bg-raised px-2 text-sm tabular-nums disabled:opacity-45"
                    />
                  </label>
                )}
                <div className="ml-auto">
                  {connected ? (
                    <Button variant="danger" onClick={resetConnection}>
                      Disconnect
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => void connect()} disabled={connecting || (kind === "serial" && !serialSupported)}>
                      <Plug className="size-3.5" aria-hidden="true" />
                      {connecting ? "Connecting…" : "Connect"}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Output options */}
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Output</span>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex items-center gap-1.5 text-sm text-ink-soft">
                  Feed
                  <input
                    type="number"
                    value={feed}
                    onChange={(e) => setFeed(Number(e.target.value) || 0)}
                    className="h-8 w-24 rounded-control border border-line bg-raised px-2 text-sm tabular-nums"
                  />
                  <span className="text-xs text-ink-faint">mm/min</span>
                </label>
                <label className="flex items-center gap-1.5 text-sm text-ink-soft">
                  Travel
                  <input
                    type="number"
                    value={travelFeed}
                    onChange={(e) => setTravelFeed(Number(e.target.value) || 0)}
                    className="h-8 w-24 rounded-control border border-line bg-raised px-2 text-sm tabular-nums"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-sm text-ink-soft">
                  <input type="checkbox" checked={flipY} onChange={(e) => setFlipY(e.target.checked)} className="size-4" />
                  Flip Y
                </label>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-ink-faint tabular-nums">
                  {result.passCount} passes · {result.lineCount} lines · {(result.cutDistanceMm / 25.4).toFixed(1)} in of path · ~
                  {Math.max(1, Math.round(result.estimateSeconds / 60))} min
                </p>
                <Button
                  variant="secondary"
                  onClick={() => downloadFile(`${slugify(useEditor.getState().doc.name)}.gcode`, result.gcode, "text/plain")}
                  aria-label="Download the G-code file"
                >
                  <Download className="size-3.5" aria-hidden="true" />
                  G-code file
                </Button>
              </div>
              <pre className="scroll-thin max-h-28 overflow-auto rounded-control border border-line bg-sunken p-2 font-mono text-[11px] leading-snug text-ink-soft">
                {result.gcode.split("\n").slice(0, 24).join("\n")}
                {result.lineCount > 24 ? `\n… ${result.lineCount - 24} more lines` : ""}
              </pre>
            </div>

            {/* Send controls */}
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <div className="flex items-center gap-2">
                <Button variant="primary" onClick={() => void send()} disabled={!connected || sending}>
                  <Send className="size-3.5" aria-hidden="true" />
                  {sending ? "Sending…" : "Send"}
                </Button>
                <Button variant="secondary" onClick={togglePause} disabled={!sending}>
                  {paused ? <Play className="size-3.5" aria-hidden="true" /> : <Pause className="size-3.5" aria-hidden="true" />}
                  {paused ? "Resume" : "Pause"}
                </Button>
                <Button variant="danger" onClick={() => streamerRef.current?.stop()} disabled={!sending}>
                  <Square className="size-3.5" aria-hidden="true" />
                  Stop
                </Button>
                {progress && (
                  <span className="ml-auto text-xs tabular-nums text-ink-soft">
                    {progress.sent}/{progress.total} · {pct}%
                  </span>
                )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct}>
                <div className="h-full bg-score transition-[width]" style={{ width: `${pct}%` }} />
              </div>
              <div className="scroll-thin h-32 overflow-auto rounded-control border border-line bg-sunken p-2 font-mono text-[11px] leading-snug">
                {log.length === 0 ? (
                  <span className="text-ink-faint">Console output appears here.</span>
                ) : (
                  log.map((l) => (
                    <div key={l.id} className={LOG_COLOR[l.dir]}>
                      {l.dir === "tx" ? "› " : l.dir === "rx" ? "‹ " : ""}
                      {l.text}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
