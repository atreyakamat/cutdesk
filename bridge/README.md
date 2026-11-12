# CutDesk bridge

A tiny local proxy so the browser app can reach a cutting machine over a real
serial port — **wired USB or Bluetooth** — and keep the connection alive in the
background.

The browser's own hardware APIs can't open Bluetooth-Classic (SPP) ports, which
is what most Cricut machines use wirelessly. This bridge can, because it's a
normal Node process with full OS serial access.

## Run

```bash
cd bridge
npm install      # builds the native serialport binding
npm start        # ws://127.0.0.1:8787
```

Then in CutDesk: **Send to machine → Bridge**, click **Refresh ports**, pick
your port, **Connect**, and **Send**.

## Finding your machine's port

A paired/connected machine shows up as a serial port:

| OS | Wired (USB) | Bluetooth |
| --- | --- | --- |
| Windows | `COM3`, `COM4`, … | `COM5+` once paired |
| macOS | `/dev/cu.usbmodem*` | `/dev/cu.*` once paired |
| Linux (Debian/Arch/Fedora) | `/dev/ttyACM0`, `/dev/ttyUSB0` | `/dev/rfcomm0` after binding |

### Bluetooth on Linux

Classic-SPP devices need a one-time bind to get an `/dev/rfcomm*` node:

```bash
bluetoothctl            # scan on; pair <MAC>; trust <MAC>; quit
sudo rfcomm bind 0 <MAC> 1      # creates /dev/rfcomm0
```

Then pick `/dev/rfcomm0` in the app. (On Windows/macOS, pairing the device in
system Bluetooth settings creates the serial port automatically.)

## Permissions

- **Linux:** add yourself to the `dialout` group (`sudo usermod -aG dialout $USER`, then log out/in) to open serial ports without `sudo`.
- The bridge binds to `127.0.0.1` only — it is not reachable from other machines.

## What it speaks

Plain GRBL-style line protocol: it forwards whatever G-code the app streams and
relays the machine's replies (`ok`, `error:…`, status) back. It works with a
Cricut Maker running **CutcutGo** firmware, or any GRBL / HPGL open cutter.
It is **not** a driver for stock Cricut firmware (that protocol is proprietary).

## Which pages may connect

Any website can try to open a WebSocket to `127.0.0.1`, so the bridge only accepts
CutDesk itself: pages on `localhost` / `127.0.0.1`, the desktop app, and the
addresses you list in `BRIDGE_ORIGINS`. If you open CutDesk from the home lab
(House of Stix), add that address:

```bash
BRIDGE_ORIGINS="http://192.168.1.10:8304" npm start
```

Other pages get a 403 and the bridge logs who tried.
