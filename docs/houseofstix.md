# Running CutDesk inside House of Stix

CutDesk registers in the [House of Stix](https://github.com/atreyakamat/houseofstix)
control room like any other Studio tool: the hub opens its `url` in a window and
polls its `health` endpoint every 15 s for a green status light.

## 1. Run CutDesk on the home lab

```bash
docker compose up --build    # serves on http://localhost:8304
```

The container listens on 3000; `docker-compose.yml` maps it to **8304** to sit
alongside the other Studio tools (cricut 8300, bgremover 8301, renamex 8303).

Health check: `GET /health.json` → `{ "ok": true, "service": "cutdesk" }` (a static
file, so it works in the server, Docker and desktop-export builds alike).

## 2. Add it to the control room

Paste this entry into House of Stix `services.yaml`:

```yaml
- id: cutdesk
  name: CutDesk
  description: Design-and-cut editor — shapes, text, trace, print-then-cut, send to machine
  icon: "🛠️"
  group: Studio tools
  tier: base
  url: http://${HOME_LAB_HOST:-localhost}:8304
  health: http://${HEALTH_HOST:-localhost}:8304/health.json
  expect: '"ok"'
```

(House of Stix already ships this entry, and `deploy/stack.conf` builds CutDesk with `stixctl up cutdesk`.)

CutDesk then appears under **Studio tools** with a live status dot, opening in
its own window. It sends `Content-Security-Policy: frame-ancestors 'self' <CONTROL_ROOM_ORIGIN>`:
the control room may frame it, no other site can. `CONTROL_ROOM_ORIGIN` is a
Docker build arg (`stixctl bootstrap` writes it to `~/stix/env/cutdesk.env`); after
changing it, rebuild (`stixctl up cutdesk`).

## Notes

- **Cricut Design Space sheets** live at `/sheets` (also *Export → Cricut A4 sticker
  sheets…*): the same shape-aware packer as the standalone `cricut` tool (port 8300),
  so once you're happy with it you can set `cricut` to `no` in House of Stix's
  `deploy/stack.conf`.
- Stock Cricut machines only cut through Design Space, so for them use `/sheets`.
  The editor's own *Print-then-cut layout* export (L-bracket marks) is for
  open-firmware cutters.
- Using the bridge with the home lab copy: start it with
  `BRIDGE_ORIGINS="http://<home lab>:8304"` (see `bridge/README.md`).
- Machine control (USB/Bluetooth) needs host hardware, so for cutting use the
  Tauri desktop build or the host-run bridge, not the Docker container.
