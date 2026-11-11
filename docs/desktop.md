# CutDesk desktop (Tauri)

CutDesk ships as a native desktop app via [Tauri v2](https://tauri.app) — a small
Rust shell around the exported web app, with **native serial** (`src-tauri/`) so
it can reach a wired cutter without the browser sandbox. The window opens at
1280×820 (min 900×600).

## Prerequisites (once)
- **Rust** (stable) — https://rustup.rs
- **Node 22+** and `npm install` in this repo
- Platform build deps:
  - **Windows:** Microsoft C++ Build Tools + WebView2 (preinstalled on Win 11)
  - **Linux:** `webkit2gtk`, `libappindicator`, `librsvg`, `patchelf` (names vary by distro; on Arch/Omarchy: `webkit2gtk-4.1 libappindicator-gtk3 librsvg patchelf`)
  - **macOS:** Xcode command-line tools

## Run in development
```bash
npm run desktop        # tauri dev — hot-reloads the Next dev server inside the native window
```

## Build an installer
```bash
npm run build:tauri    # static-export the web app to ./out (what Tauri bundles)
npm run tauri build    # compile the Rust shell + produce installers for THIS OS
```
Tauri builds per-OS, so run `tauri build` on each target machine. Output lands in
`src-tauri/target/release/bundle/`:

| OS | Artifacts |
| --- | --- |
| Windows | `.msi` (WiX) and `.exe` (NSIS) under `bundle/msi/` and `bundle/nsis/` |
| Linux | `.deb` and `.AppImage` under `bundle/deb/` and `bundle/appimage/` |
| macOS | `.app` and `.dmg` under `bundle/macos/` and `bundle/dmg/` |

The frontend is a **static export** (`NEXT_OUTPUT_EXPORT=1`), so the desktop app
has no Node server — it loads `out/index.html` directly. Machine features use the
native serial transport (`src/lib/machine/tauriSerial.ts` → Rust commands in
`src-tauri/src/`), the same `Transport` interface as the web Web-Serial path.
