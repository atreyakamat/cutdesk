#!/usr/bin/env node
/**
 * CutDesk bridge — a tiny local proxy between the browser app and a real cutting
 * machine's serial port. The browser can't open Bluetooth-Classic (SPP) ports
 * or hold a background connection; this Node process can, on Windows, macOS and
 * Linux (Debian, Arch/Omarchy, Fedora).
 *
 * A paired Cricut or cutter appears to the OS as a serial port:
 *   - Windows:  COM3, COM4, …
 *   - macOS:    /dev/tty.* / /dev/cu.*
 *   - Linux:    /dev/ttyACM0 (USB) or /dev/rfcomm0 (Bluetooth, after binding)
 * Select that port in the app's "Send to machine" dialog (Bridge transport).
 *
 * Protocol (JSON text frames over ws://127.0.0.1:8787):
 *   browser → { type:"list" }                 → server → { type:"ports", ports:[{path,label}] }
 *   browser → { type:"open", port, baud }      → server → { type:"open-ok" } | { type:"error", message }
 *   browser → { type:"data", data }            (written straight to the port)
 *   browser → { type:"close" }                 → server → { type:"closed" }
 *   server  → { type:"data", data }            (bytes coming back from the machine)
 *
 * Run:  cd bridge && npm install && npm start
 */

import { WebSocketServer } from "ws";
import { SerialPort } from "serialport";

const PORT = Number(process.env.PORT) || 8787;

/*
 * Which pages may talk to the bridge. Browsers let ANY website open a WebSocket
 * to 127.0.0.1, so without this check a page you happen to visit could drive
 * your cutter. Allowed: CutDesk on this computer (localhost, the desktop app)
 * and the addresses in BRIDGE_ORIGINS, e.g. the home lab copy:
 *   BRIDGE_ORIGINS="http://192.168.1.10:8304,https://cutdesk.example.com" npm start
 */
const EXTRA_ORIGINS = new Set(
  (process.env.BRIDGE_ORIGINS ?? "")
    .split(/[\s,]+/)
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean),
);

export function originAllowed(origin) {
  if (!origin) return false;
  if (EXTRA_ORIGINS.has(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol === "tauri:") return true;
    if (!["http:", "https:"].includes(u.protocol)) return false;
    return ["localhost", "127.0.0.1", "[::1]", "tauri.localhost"].includes(u.hostname);
  } catch {
    return false;
  }
}

const wss = new WebSocketServer({
  host: "127.0.0.1",
  port: PORT,
  maxPayload: 1024 * 1024,
  verifyClient: ({ origin }, done) => {
    if (originAllowed(origin)) return done(true);
    console.warn(`[bridge] refused a connection from ${origin || "an unknown page"} (add it to BRIDGE_ORIGINS if it's yours)`);
    done(false, 403, "Origin not allowed");
  },
});

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

async function listPorts() {
  const ports = await SerialPort.list();
  return ports.map((p) => ({
    path: p.path,
    label: [p.path, p.manufacturer, p.friendlyName].filter(Boolean).join(" · "),
  }));
}

wss.on("connection", (ws) => {
  let serial = null;
  console.log("[bridge] browser connected");

  const closeSerial = () => {
    if (serial && serial.isOpen) {
      try {
        serial.close();
      } catch {
        /* ignore */
      }
    }
    serial = null;
  };

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "list") {
      try {
        send(ws, { type: "ports", ports: await listPorts() });
      } catch (err) {
        send(ws, { type: "error", message: `Couldn't list ports: ${err.message}` });
      }
      return;
    }

    if (msg.type === "open") {
      closeSerial();
      try {
        serial = new SerialPort({ path: msg.port, baudRate: Number(msg.baud) || 115200, autoOpen: false });
        serial.on("data", (buf) => send(ws, { type: "data", data: buf.toString("utf8") }));
        serial.on("error", (err) => send(ws, { type: "error", message: err.message }));
        serial.on("close", () => send(ws, { type: "closed" }));
        serial.open((err) => {
          if (err) send(ws, { type: "error", message: `Couldn't open ${msg.port}: ${err.message}` });
          else {
            console.log(`[bridge] opened ${msg.port} @ ${serial.baudRate}`);
            send(ws, { type: "open-ok" });
          }
        });
      } catch (err) {
        send(ws, { type: "error", message: err.message });
      }
      return;
    }

    if (msg.type === "data") {
      if (serial && serial.isOpen) serial.write(msg.data);
      return;
    }

    if (msg.type === "close") {
      closeSerial();
      send(ws, { type: "closed" });
    }
  });

  ws.on("close", () => {
    console.log("[bridge] browser disconnected");
    closeSerial();
  });
});

console.log(`CutDesk bridge listening on ws://127.0.0.1:${PORT}`);
console.log("Open the app over HTTPS or http://localhost, choose the Bridge transport, and pick your port.");
