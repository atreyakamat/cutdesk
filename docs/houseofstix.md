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
  tier: heavy
  url: http://${HOME_LAB_HOST:-localhost}:8304
  health: http://${HEALTH_HOST:-localhost}:8304/health.json
  expect: '"ok": true'
```

CutDesk then appears under **Studio tools** with a live status dot, opening in
its own window. It sets no `X-Frame-Options`, so it embeds in the control room's
app-window; if you later put it behind a proxy, allow framing from the control
room origin (`Content-Security-Policy: frame-ancestors`).

## Notes

- The existing `cricut` tool (port 8300, "Pack stickers onto A4 Print Then Cut
  sheets") is a separate, smaller tool — CutDesk is the full editor and gets its
  own `id`.
- Machine control (USB/Bluetooth) needs host hardware, so for cutting use the
  Tauri desktop build or the host-run bridge, not the Docker container.
