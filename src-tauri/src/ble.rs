// Native Bluetooth Low Energy for the desktop build.
//
// The browser's Web Bluetooth is Chromium-only, needs HTTPS, and can only touch services you
// name in advance. This talks to the OS Bluetooth stack directly (BlueZ on Linux), so it
// works in the desktop app with no browser, and it can list *every* service a device has.
//
// Two things live here:
//   * a transport: G-code out over a serial-over-GATT service (Nordic UART or HM-10),
//     replies back as "ble-data" events;
//   * a read-only explorer that never writes to the device.
//
// This is NOT a driver for stock Cricut firmware (private protocol). The explorer is how you
// find out what one offers.

use std::time::Duration;

use btleplug::api::{Central, CharPropFlags, Characteristic, Manager as _, Peripheral as _, ScanFilter, WriteType};
use btleplug::platform::{Adapter, Manager, Peripheral};
use futures::stream::StreamExt;
use serde::Serialize;
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{Mutex, OnceCell};
use uuid::Uuid;

/// BLE's default ATT payload is 20 bytes; the negotiated MTU isn't exposed portably.
const CHUNK: usize = 20;
/// Breathing room between writes so cheap adapters don't drop bytes.
const WRITE_GAP: Duration = Duration::from_millis(8);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

struct Profile {
    label: &'static str,
    service: Uuid,
    write: Uuid,
    notify: Uuid,
}

const PROFILES: [Profile; 2] = [
    Profile {
        label: "Nordic UART",
        service: Uuid::from_u128(0x6e400001_b5a3_f393_e0a9_e50e24dcca9e),
        write: Uuid::from_u128(0x6e400002_b5a3_f393_e0a9_e50e24dcca9e),
        notify: Uuid::from_u128(0x6e400003_b5a3_f393_e0a9_e50e24dcca9e),
    },
    Profile {
        label: "HM-10 / JDY",
        service: Uuid::from_u128(0x0000ffe0_0000_1000_8000_00805f9b34fb),
        write: Uuid::from_u128(0x0000ffe1_0000_1000_8000_00805f9b34fb),
        notify: Uuid::from_u128(0x0000ffe1_0000_1000_8000_00805f9b34fb),
    },
];

// ---- pure helpers (unit-tested without Bluetooth hardware) ---------------------------------

fn pick_profile(service_uuids: &[Uuid]) -> Option<&'static Profile> {
    PROFILES.iter().find(|p| service_uuids.contains(&p.service))
}

fn chunk_bytes(data: &[u8], size: usize) -> Vec<&[u8]> {
    data.chunks(size.max(1)).collect()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect::<Vec<_>>().join(" ")
}

fn property_names(flags: CharPropFlags) -> Vec<&'static str> {
    let table = [
        (CharPropFlags::READ, "read"),
        (CharPropFlags::WRITE, "write"),
        (CharPropFlags::WRITE_WITHOUT_RESPONSE, "write-no-response"),
        (CharPropFlags::NOTIFY, "notify"),
        (CharPropFlags::INDICATE, "indicate"),
        (CharPropFlags::BROADCAST, "broadcast"),
    ];
    table.iter().filter(|(f, _)| flags.contains(*f)).map(|(_, n)| *n).collect()
}

fn clamp_ms(ms: u64, lo: u64, hi: u64) -> u64 {
    ms.clamp(lo, hi)
}

// ---- state ----------------------------------------------------------------------------------

struct Link {
    peripheral: Peripheral,
    write: Characteristic,
    write_type: WriteType,
    pump: JoinHandle<()>,
}

#[derive(Default)]
pub struct BleState {
    adapter: OnceCell<Adapter>,
    link: Mutex<Option<Link>>,
}

async fn adapter(state: &BleState) -> Result<&Adapter, String> {
    state
        .adapter
        .get_or_try_init(|| async {
            let manager = Manager::new().await.map_err(|e| format!("Bluetooth isn't available: {e}"))?;
            let adapters = manager.adapters().await.map_err(|e| e.to_string())?;
            adapters
                .into_iter()
                .next()
                .ok_or_else(|| "No Bluetooth adapter found. Is Bluetooth switched on (and BlueZ running)?".to_string())
        })
        .await
}

async fn find_peripheral(adapter: &Adapter, id: &str) -> Result<Peripheral, String> {
    adapter
        .peripherals()
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|p| p.id().to_string() == id)
        .ok_or_else(|| "That device isn't in range any more. Scan again.".to_string())
}

async fn connect_peripheral(p: &Peripheral) -> Result<(), String> {
    if !p.is_connected().await.unwrap_or(false) {
        tokio::time::timeout(CONNECT_TIMEOUT, p.connect())
            .await
            .map_err(|_| "Timed out connecting. Is the cutter on and close by?".to_string())?
            .map_err(|e| format!("Couldn't connect: {e}"))?;
    }
    p.discover_services().await.map_err(|e| format!("Couldn't read the device's services: {e}"))
}

// ---- commands -------------------------------------------------------------------------------

#[derive(Serialize)]
pub struct BleDevice {
    id: String,
    name: String,
    rssi: Option<i16>,
}

/// Scan for nearby BLE devices and return them, strongest first.
#[tauri::command]
pub async fn ble_scan(state: State<'_, BleState>, timeout_ms: Option<u64>) -> Result<Vec<BleDevice>, String> {
    let adapter = adapter(&state).await?;
    adapter.start_scan(ScanFilter::default()).await.map_err(|e| format!("Couldn't start scanning: {e}"))?;
    tokio::time::sleep(Duration::from_millis(clamp_ms(timeout_ms.unwrap_or(4000), 1000, 15000))).await;
    let _ = adapter.stop_scan().await;

    let mut out = Vec::new();
    for p in adapter.peripherals().await.map_err(|e| e.to_string())? {
        let props = p.properties().await.ok().flatten();
        let name = props.as_ref().and_then(|x| x.local_name.clone()).unwrap_or_default();
        out.push(BleDevice {
            id: p.id().to_string(),
            name: if name.is_empty() { "(unnamed)".to_string() } else { name },
            rssi: props.and_then(|x| x.rssi),
        });
    }
    out.sort_by(|a, b| b.rssi.unwrap_or(i16::MIN).cmp(&a.rssi.unwrap_or(i16::MIN)));
    Ok(out)
}

/// Connect to a cutter's serial-over-GATT service. Returns the profile used.
#[tauri::command]
pub async fn ble_connect(app: AppHandle, state: State<'_, BleState>, id: String) -> Result<String, String> {
    ble_disconnect(state.clone()).await?;
    let adapter = adapter(&state).await?;
    let peripheral = find_peripheral(adapter, &id).await?;
    connect_peripheral(&peripheral).await?;

    let services: Vec<Uuid> = peripheral.services().iter().map(|s| s.uuid).collect();
    let Some(profile) = pick_profile(&services) else {
        let _ = peripheral.disconnect().await;
        return Err("This device has no serial-over-Bluetooth service (Nordic UART or HM-10). Stock Cricut machines don't offer one.".into());
    };
    let chars = peripheral.characteristics();
    let find = |u: Uuid| chars.iter().find(|c| c.uuid == u && c.service_uuid == profile.service).cloned();
    let (Some(write), Some(notify)) = (find(profile.write), find(profile.notify)) else {
        let _ = peripheral.disconnect().await;
        return Err("The serial service is missing its read/write channels.".into());
    };
    let write_type = if write.properties.contains(CharPropFlags::WRITE_WITHOUT_RESPONSE) {
        WriteType::WithoutResponse
    } else {
        WriteType::WithResponse
    };

    let mut stream = peripheral.notifications().await.map_err(|e| e.to_string())?;
    peripheral.subscribe(&notify).await.map_err(|e| format!("Couldn't open the serial channel: {e}"))?;

    let notify_uuid = notify.uuid;
    let pump = tauri::async_runtime::spawn(async move {
        while let Some(n) = stream.next().await {
            if n.uuid == notify_uuid && app.emit("ble-data", String::from_utf8_lossy(&n.value).to_string()).is_err() {
                return;
            }
        }
        // The stream ends when the device goes away.
        let _ = app.emit("ble-disconnected", ());
    });

    *state.link.lock().await = Some(Link { peripheral, write, write_type, pump });
    Ok(profile.label.to_string())
}

/// Send text to the machine in ordered 20-byte writes.
#[tauri::command]
pub async fn ble_write(state: State<'_, BleState>, data: String) -> Result<(), String> {
    // Holding the lock for the whole write keeps lines in order and chunks from interleaving.
    let guard = state.link.lock().await;
    let link = guard.as_ref().ok_or("Bluetooth isn't connected.")?;
    for piece in chunk_bytes(data.as_bytes(), CHUNK) {
        if !link.peripheral.is_connected().await.unwrap_or(false) {
            return Err("Bluetooth connection lost.".into());
        }
        link.peripheral.write(&link.write, piece, link.write_type).await.map_err(|e| format!("Bluetooth write failed: {e}"))?;
        tokio::time::sleep(WRITE_GAP).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn ble_disconnect(state: State<'_, BleState>) -> Result<(), String> {
    if let Some(link) = state.link.lock().await.take() {
        link.pump.abort();
        let _ = link.peripheral.disconnect().await;
    }
    Ok(())
}

#[derive(Serialize)]
pub struct CharInfo {
    uuid: String,
    properties: Vec<&'static str>,
    value: Option<String>,
    read_error: Option<String>,
}

#[derive(Serialize)]
pub struct ServiceInfo {
    uuid: String,
    characteristics: Vec<CharInfo>,
}

#[derive(Serialize)]
pub struct ExploreResult {
    device_name: String,
    services: Vec<ServiceInfo>,
    /// Notifications heard, as capture-log lines ("rx 0a 0b …").
    frames: Vec<String>,
}

/// List everything a device offers, read what is readable, and listen briefly for notifications.
/// Read-only: nothing is ever written to the device.
#[tauri::command]
pub async fn ble_explore(state: State<'_, BleState>, id: String, listen_ms: Option<u64>) -> Result<ExploreResult, String> {
    if state.link.lock().await.is_some() {
        return Err("Disconnect from the cutter before exploring.".into());
    }
    let adapter = adapter(&state).await?;
    let peripheral = find_peripheral(adapter, &id).await?;
    connect_peripheral(&peripheral).await?;

    let device_name = peripheral.properties().await.ok().flatten().and_then(|p| p.local_name).unwrap_or_else(|| "unnamed device".into());

    let result = async {
        let mut services: Vec<ServiceInfo> = Vec::new();
        let mut subscribed: Vec<Characteristic> = Vec::new();
        let listen = clamp_ms(listen_ms.unwrap_or(3000), 0, 15000);
        let mut stream = peripheral.notifications().await.map_err(|e| e.to_string())?;

        for svc in peripheral.services() {
            let mut chars = Vec::new();
            for c in &svc.characteristics {
                let mut info = CharInfo { uuid: c.uuid.to_string(), properties: property_names(c.properties), value: None, read_error: None };
                if c.properties.contains(CharPropFlags::READ) {
                    match peripheral.read(c).await {
                        Ok(v) => info.value = Some(hex(&v)),
                        Err(e) => info.read_error = Some(e.to_string()),
                    }
                }
                if listen > 0 && c.properties.intersects(CharPropFlags::NOTIFY | CharPropFlags::INDICATE) && peripheral.subscribe(c).await.is_ok() {
                    subscribed.push(c.clone());
                }
                chars.push(info);
            }
            services.push(ServiceInfo { uuid: svc.uuid.to_string(), characteristics: chars });
        }

        let mut frames = Vec::new();
        if !subscribed.is_empty() {
            let _ = tokio::time::timeout(Duration::from_millis(listen), async {
                while let Some(n) = stream.next().await {
                    frames.push(format!("rx {}", hex(&n.value)));
                }
            })
            .await;
        }
        for c in &subscribed {
            let _ = peripheral.unsubscribe(c).await;
        }
        Ok::<_, String>((services, frames))
    }
    .await;

    let _ = peripheral.disconnect().await;
    let (services, frames) = result?;
    Ok(ExploreResult { device_name, services, frames })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_a_known_serial_service() {
        let other = Uuid::from_u128(0x0000180f_0000_1000_8000_00805f9b34fb);
        assert_eq!(pick_profile(&[other, PROFILES[0].service]).map(|p| p.label), Some("Nordic UART"));
        assert_eq!(pick_profile(&[PROFILES[1].service]).map(|p| p.label), Some("HM-10 / JDY"));
        assert!(pick_profile(&[other]).is_none());
        assert!(pick_profile(&[]).is_none());
    }

    #[test]
    fn chunks_keep_every_byte_in_order_and_never_exceed_the_limit() {
        let data: Vec<u8> = (0..45).collect();
        let parts = chunk_bytes(&data, 20);
        assert_eq!(parts.iter().map(|p| p.len()).collect::<Vec<_>>(), vec![20, 20, 5]);
        assert_eq!(parts.concat(), data);
        assert!(chunk_bytes(&[], 20).is_empty());
        // a zero size must not loop forever or panic
        assert_eq!(chunk_bytes(&[1, 2, 3], 0).len(), 3);
    }

    #[test]
    fn hex_matches_the_capture_log_format() {
        assert_eq!(hex(&[0, 15, 255]), "00 0f ff");
        assert_eq!(hex(&[]), "");
    }

    #[test]
    fn names_every_property_flag() {
        let f = CharPropFlags::READ | CharPropFlags::NOTIFY | CharPropFlags::WRITE_WITHOUT_RESPONSE;
        assert_eq!(property_names(f), vec!["read", "write-no-response", "notify"]);
        assert!(property_names(CharPropFlags::empty()).is_empty());
    }

    #[test]
    fn scan_time_is_clamped() {
        assert_eq!(clamp_ms(0, 1000, 15000), 1000);
        assert_eq!(clamp_ms(99_999, 1000, 15000), 15000);
        assert_eq!(clamp_ms(4000, 1000, 15000), 4000);
    }

    #[test]
    fn profile_uuids_are_the_documented_ones() {
        assert_eq!(PROFILES[0].service.to_string(), "6e400001-b5a3-f393-e0a9-e50e24dcca9e");
        assert_eq!(PROFILES[1].service.to_string(), "0000ffe0-0000-1000-8000-00805f9b34fb");
        assert_eq!(PROFILES[1].write, PROFILES[1].notify);
    }
}
