// CutDesk desktop backend.
//
// Gives the web UI native serial access through Tauri commands, so the desktop
// build talks to a cutter directly — wired USB, or a Bluetooth device that the
// OS exposes as a serial port — with none of the browser's HTTPS/Chromium
// limits. Incoming bytes are pushed to the frontend as "serial-data" events.

mod ble;

use std::io::{Read, Write};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use serialport::SerialPort;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
struct SerialState {
    port: Mutex<Option<Box<dyn SerialPort>>>,
}

#[derive(Serialize)]
struct PortInfo {
    path: String,
    label: String,
}

#[tauri::command]
fn list_serial_ports() -> Result<Vec<PortInfo>, String> {
    let mut ports = serialport::available_ports().map_err(|e| e.to_string())?;
    // A Bluetooth Classic cutter bound with `rfcomm bind` is an ordinary serial device, but the
    // port scan doesn't always list it. Add any /dev/rfcomm* that is missing.
    #[cfg(target_os = "linux")]
    if let Ok(entries) = std::fs::read_dir("/dev") {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            let path = format!("/dev/{name}");
            if name.starts_with("rfcomm") && !ports.iter().any(|p| p.port_name == path) {
                ports.push(serialport::SerialPortInfo { port_name: path, port_type: serialport::SerialPortType::Unknown });
            }
        }
    }
    Ok(ports
        .into_iter()
        .map(|p| {
            let label = match p.port_type {
                serialport::SerialPortType::UsbPort(info) => {
                    let mut parts = vec![p.port_name.clone()];
                    if let Some(m) = info.manufacturer {
                        parts.push(m);
                    }
                    if let Some(prod) = info.product {
                        parts.push(prod);
                    }
                    parts.join(" · ")
                }
                _ => p.port_name.clone(),
            };
            PortInfo {
                path: p.port_name,
                label,
            }
        })
        .collect())
}

#[tauri::command]
fn open_serial(app: AppHandle, state: State<'_, SerialState>, path: String, baud: u32) -> Result<(), String> {
    let port = serialport::new(&path, baud)
        .timeout(Duration::from_millis(50))
        .open()
        .map_err(|e| e.to_string())?;
    let mut reader = port.try_clone().map_err(|e| e.to_string())?;
    *state.port.lock().map_err(|e| e.to_string())? = Some(port);

    // Pump bytes from the machine back to the UI until the port closes.
    std::thread::spawn(move || {
        let mut buf = [0u8; 2048];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {}
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    if app.emit("serial-data", text).is_err() {
                        break;
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(_) => break,
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn write_serial(state: State<'_, SerialState>, data: String) -> Result<(), String> {
    let mut guard = state.port.lock().map_err(|e| e.to_string())?;
    match guard.as_mut() {
        Some(port) => port.write_all(data.as_bytes()).map_err(|e| e.to_string()),
        None => Err("Serial port is not open.".into()),
    }
}

#[tauri::command]
fn close_serial(state: State<'_, SerialState>) -> Result<(), String> {
    *state.port.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SerialState::default())
        .manage(ble::BleState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            open_serial,
            write_serial,
            close_serial,
            ble::ble_scan,
            ble::ble_connect,
            ble::ble_write,
            ble::ble_disconnect,
            ble::ble_explore
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
