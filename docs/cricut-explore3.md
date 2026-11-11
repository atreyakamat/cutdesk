# Driving a Cricut Explore 3 over USB — reverse-engineering plan

> **Status: Phase 2, blocked on a capture.** The Explore 3's USB protocol is not
> publicly documented. This doc is the plan and the exact data to collect so the
> protocol can be decoded and a driver written. **Nothing here sends bytes to the
> machine** — we analyse captured traffic first.

## Why this is hard (and the honest risk)

- The **original** Cricut (2010-era) was a plain USB serial port and got
  reverse-engineered ([libcutter](https://github.com/vangdfang/libcutter)). The
  **modern Maker/Explore** is not that machine.
- A Maker capture looked like it "isn't in any obvious format, and **may be
  encrypted**" ([Bradley Gannon](https://bradleygannon.com/blog/2026/cricut-maker-not-quite-on-linux/)).
  There is **no public Explore 3 protocol** ([open issue](https://github.com/EdaDyckATpmDOTme/Stick-It-To-Cricut/issues/1)).
- "Not cloud-signed" (the machine cuts offline) is **separate** from the on-wire
  bytes being encrypted. The capture tells us which we face.
- **Safety:** a wrong write to a cutter can drive the head into a limit or damage
  it. We **never** send guessed bytes. Decode first; replay only known-good
  captured frames; only then synthesise.

## The pipeline we're building toward

```
Canva design ──(export SVG)──▶ CutDesk import ──▶ cut plan (mm) ──▶ CricutEncoder ──▶ USB frames ──▶ Explore 3
                                                   (already built)     (TODO: this phase)
```

`src/lib/machine/cricut/` is where the driver lives:

- `capture.ts` — **built & tested.** Parses a direction-tagged hex log into
  frames and reports per-direction byte totals, candidate headers, and an
  entropy estimate (`looksEncrypted()` flags a stream that looks random).
- `protocol.ts` — types + `CricutEncoder` interface. Ships an `inertEncoder`
  that throws, so nothing can stream improvised bytes. The real encoder goes
  here once the capture is decoded.
- *(later)* a binary transport + Rust `cricut_*` commands in `src-tauri/`, added
  only after we know whether the device is CDC-serial or raw-bulk USB.

## What to capture (on the Windows machine with Design Space)

Do these in order and keep the files separate and labelled.

### 1. Device identity & descriptors
- **Windows:** open Device Manager → the Cricut → Details →
  *Hardware Ids* (gives `VID_xxxx&PID_xxxx`). Note the device **class** (does it
  show as a COM port / "USB Serial Device", or as a generic USB device?).
- Or run `usbview` (free, from Microsoft) and **save the full descriptor dump**
  for the Cricut — we need interfaces, endpoints (bulk/interrupt), and classes.
- **Linux cross-check (optional):** `lsusb` then `lsusb -v -d <vid>:<pid>`.
- *(Maker shows VID `20D3`/PID `0015`; confirm yours — it may differ.)*

### 2. USB traffic for known, simple jobs
Install **Wireshark** with **USBPcap** (Windows). Capture the Cricut's USB
device while Design Space does each action below. **One capture file per
action**, named for it:

1. **Connect only** — plug in / power on, let Design Space detect it, do nothing
   else. (Handshake / identity.)
2. **Load mat** — press the load button. (Motion / status frames.)
3. **Cut one 20 mm square** in the exact centre of the mat, blade, default
   material. (The golden sample — known geometry.)
4. **Cut two squares** (20 mm at top-left, 40 mm at bottom-right). (Lets us find
   coordinate scaling and how position is encoded.)
5. **Draw** the same 20 mm square with a **pen** instead of cutting. (Tool
   select / pressure vs. blade.)
6. **Unload mat.**

For each: start the capture, do the one action, stop the capture, **File → Export
Specified Packets** (or save the `.pcapng`).

### 3. Turn each capture into a log I can read

Easiest is `tshark` (ships with Wireshark). For a USB capture, export the
payload bytes with a direction column. A good starting command:

```bash
# usb.transfer_type==3 is bulk; adjust if descriptors show interrupt/control data
tshark -r cut-20mm-square.pcapng \
  -Y "usb.capdata" \
  -T fields -e usb.endpoint_address.direction -e usb.capdata \
  | sed 's/^0/TX /; s/^1/RX /' > cut-20mm-square.log
```

That yields lines like `TX 0200 1e00 ...` / `RX 90 00 ...` — exactly what
`parseCaptureLog()` eats. If `tshark` is awkward, Wireshark's **"Export Packet
Bytes"** per packet, or even a hand-transcribed hex dump with `TX`/`RX` tags per
line, works too.

### 4. Send me
- the descriptor dump (step 1),
- the `.log` files (or `.pcapng` if easier) for each action,
- which action each file is.

I'll run them through `summarize()` first. If `looksEncrypted()` is false and the
20 mm-square capture shows readable structure that scales with geometry, we can
start writing `CricutEncoder`. If it's encrypted, I'll tell you straight — that
likely ends the direct-driver route for this model and we fall back to the
open-firmware or SVG/G-code paths.

## Testing on your hardware
When there's something to try, we replay **only captured, known-good frames**
back to the machine first (identical bytes Design Space already sent), confirm
the machine behaves identically, and only then synthesise new geometry. You run
these on the Windows box; I'll hand you each exact step and we go one frame-group
at a time.
