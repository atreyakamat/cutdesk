# Bluetooth

CutDesk can talk to a cutter over **Bluetooth Low Energy (BLE)** from the browser, and can
**explore** any BLE device to see what it offers. Chrome or Edge only (Firefox and Safari
don't have Web Bluetooth), over HTTPS or `localhost`. On Linux it needs BlueZ running.

## What works today

**Send to machine → Bluetooth (BLE)** connects to a cutter that exposes a serial-over-GATT
service and speaks a GRBL-style line protocol. Two common layouts are recognised:

| Profile | Service | Notes |
| --- | --- | --- |
| Nordic UART | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` | ESP32, nRF52 and most BLE GRBL boards |
| HM-10 / JDY | `0000ffe0-…` | one shared characteristic `ffe1` |

G-code is written in 20-byte pieces, in order, and replies come back as notifications.
If the Bluetooth link drops, the log says so and sending stops.

## What does not work

**Stock Cricut machines.** Cricut uses a private protocol (and on some models, Bluetooth
Classic rather than BLE, which browsers can't open). CutDesk does not drive them over
Bluetooth, and nothing here claims to. Connecting to one gives a plain "no serial service"
message.

For a Bluetooth Classic cutter (older Cricut Maker or Explore Air 2 running open firmware),
pair it in your OS, bind it as a serial port (`/dev/rfcomm0` on Linux), and use the
**bridge** (`bridge/`), which sees it as an ordinary serial port.

## Exploring a Cricut

**Send to machine → Bluetooth (BLE) → Explore** connects, lists every service and
characteristic it can see (with read/write/notify flags and current values), listens for
notifications for three seconds, and disconnects. **It never writes to the device.**

Two limits to know:

1. The browser only reveals services you name up front. The standard ones are included; for
   a machine's own services, look at it once in a phone app such as **nRF Connect**, then
   paste the UUIDs into the box.
2. Some services are blocked by the browser's Web Bluetooth blocklist.

The notifications it hears can be copied as a capture log (`rx 0a 0b …`), which is exactly
what the Cricut capture analyser in `src/lib/machine/cricut/` reads. That is the same
first step as the USB plan in [cricut-explore3.md](cricut-explore3.md): look at the bytes,
check whether they're plain or encrypted, and only then think about sending anything.

## Code

- `src/lib/machine/webBluetooth.ts`: the transport
- `src/lib/machine/ble/profiles.ts`: UART profiles and pure helpers
- `src/lib/machine/ble/explore.ts`: the read-only explorer
- Tests use a fake GATT device, so they run without Bluetooth hardware
