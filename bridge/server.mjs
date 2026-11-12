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
import { DEFAULT_LOCAL_PORTS, originAllowed, parseOriginList } from "./origin.mjs";

const PORT = Number(process.env.PORT) || 8787;

const EXTRA_ORIGINS = parseOriginList(process.env.BRIDGE_ORIGINS);
const LOCAL_PORTS = process.env.BRIDGE_LOCAL_PORTS
  ? process.env.BRIDGE_LOCAL_PORTS.split(/[\s,]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 65536)
  : DEFAULT_LOCAL_PORTS;

const allowed = (origin) => originAllowed(origin, { extraOrigins: EXTRA_ORIGINS, localPorts: LOCAL_PORTS });

const wss = new WebSocketServer({
  host: "127.0.0.1",
  port: PORT,
  maxPayload: 1024 * 1024,
  verifyClient: ({ origin }, done) => {
    if (allowed(origin)) return done(true);
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
