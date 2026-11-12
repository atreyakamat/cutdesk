import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCaptureLog } from "./cricut/capture";
import { exploreDevice, formatExploreReport } from "./ble/explore";
import { UART_PROFILES } from "./ble/profiles";
import { WebBluetoothTransport } from "./webBluetooth";

type Listener = (e: Event) => void;

function fakeChar(uuid: string, props: Partial<BluetoothCharacteristicProperties>, onWrite?: (b: Uint8Array) => void) {
  const listeners = new Set<Listener>();
  const ch = {
    uuid,
    properties: { read: false, write: false, writeWithoutResponse: false, notify: false, indicate: false, broadcast: false, ...props },
    value: undefined as DataView | undefined,
    readValue: vi.fn(async () => new DataView(Uint8Array.of(0xde, 0xad).buffer)),
    writeValue: vi.fn(),
    writeValueWithResponse: vi.fn(async (b: BufferSource) => onWrite?.(new Uint8Array(b as ArrayBuffer))),
    writeValueWithoutResponse: vi.fn(async (b: BufferSource) => onWrite?.(new Uint8Array(b as ArrayBuffer))),
    startNotifications: vi.fn(async () => ch),
    stopNotifications: vi.fn(async () => ch),
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
    notify(text: string) {
      const bytes = new TextEncoder().encode(text);
      ch.value = new DataView(bytes.buffer);
      for (const l of listeners) l({ target: ch } as unknown as Event);
    },
  };
  return ch;
}

function fakeDevice(serviceUuids: string[], chars: Record<string, ReturnType<typeof fakeChar>[]>) {
  const disconnectListeners = new Set<Listener>();
  const server = {
    connected: true,
    connect: vi.fn(async () => server),
    disconnect: vi.fn(() => {
      server.connected = false;
    }),
    getPrimaryService: vi.fn(),
    getPrimaryServices: vi.fn(async () =>
      serviceUuids.map((uuid) => ({
        uuid,
        getCharacteristics: async () => chars[uuid] ?? [],
        getCharacteristic: async (c: string) => {
          const found = (chars[uuid] ?? []).find((x) => x.uuid === c);
          if (!found) throw new Error("no such characteristic");
          return found;
        },
      })),
    ),
  };
  const device = {
    id: "dev1",
    name: "TestCutter",
    gatt: server,
    addEventListener: (_: string, fn: Listener) => disconnectListeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => disconnectListeners.delete(fn),
    dropConnection() {
      for (const l of disconnectListeners) l({} as Event);
    },
  };
  return { device, server };
}

const NUS = UART_PROFILES[0];

beforeEach(() => {
  vi.stubGlobal("navigator", {});
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WebBluetoothTransport", () => {
  it("isn't supported without navigator.bluetooth, and connect explains why", async () => {
    expect(WebBluetoothTransport.isSupported()).toBe(false);
    await expect(new WebBluetoothTransport().connect()).rejects.toThrow(/Web Bluetooth isn't available/);
  });

  it("connects over Nordic UART, writes in 20-byte pieces in order, and relays replies", async () => {
    const written: Uint8Array[] = [];
    const tx = fakeChar(NUS.write, { writeWithoutResponse: true }, (b) => written.push(b));
    const rx = fakeChar(NUS.notify, { notify: true });
    const { device } = fakeDevice([NUS.service], { [NUS.service]: [tx, rx] });
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: vi.fn(async () => device) } });

    const t = new WebBluetoothTransport();
    const heard: string[] = [];
    t.subscribe((c) => heard.push(c));
    await t.connect();
    expect(t.connected).toBe(true);
    expect(t.deviceName).toBe("TestCutter");
    expect(rx.startNotifications).toHaveBeenCalled();

    const line1 = "G1 X10.000 Y20.000 F1000\n"; // 25 bytes
    const line2 = "M5\n";
    await Promise.all([t.send(line1), t.send(line2)]);
    expect(written.every((w) => w.length <= 20)).toBe(true);
    expect(new TextDecoder().decode(Uint8Array.from(written.flatMap((w) => [...w])))).toBe(line1 + line2);

    rx.notify("ok\r\n");
    expect(heard.join("")).toBe("ok\r\n");
  });

  it("uses write-with-response when the characteristic needs it", async () => {
    const shared = fakeChar(UART_PROFILES[1].write, { write: true, notify: true });
    const { device } = fakeDevice([UART_PROFILES[1].service], { [UART_PROFILES[1].service]: [shared] });
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: async () => device } });
    const t = new WebBluetoothTransport();
    await t.connect();
    await t.send("M5\n");
    expect(shared.writeValueWithResponse).toHaveBeenCalled();
    expect(shared.writeValueWithoutResponse).not.toHaveBeenCalled();
  });

  it("refuses a device with no serial service, and disconnects it", async () => {
    const { device, server } = fakeDevice(["0000180f-0000-1000-8000-00805f9b34fb"], {});
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: async () => device } });
    await expect(new WebBluetoothTransport().connect()).rejects.toThrow(/no serial-over-Bluetooth service/);
    expect(server.disconnect).toHaveBeenCalled();
  });

  it("reports a dropped connection and fails later writes instead of hanging", async () => {
    const tx = fakeChar(NUS.write, { writeWithoutResponse: true });
    const rx = fakeChar(NUS.notify, { notify: true });
    const { device } = fakeDevice([NUS.service], { [NUS.service]: [tx, rx] });
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: async () => device } });
    const t = new WebBluetoothTransport();
    const heard: string[] = [];
    t.subscribe((c) => heard.push(c));
    await t.connect();
    device.dropConnection();
    expect(t.connected).toBe(false);
    expect(heard.join("")).toMatch(/connection lost/);
    await expect(t.send("M5\n")).rejects.toThrow(/isn't connected/);
  });

  it("a failed write doesn't block the next one", async () => {
    let fail = true;
    const tx = fakeChar(NUS.write, { writeWithoutResponse: true }, () => {
      if (fail) {
        fail = false;
        throw new Error("GATT busy");
      }
    });
    const rx = fakeChar(NUS.notify, { notify: true });
    const { device } = fakeDevice([NUS.service], { [NUS.service]: [tx, rx] });
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: async () => device } });
    const t = new WebBluetoothTransport();
    await t.connect();
    await expect(t.send("A\n")).rejects.toThrow("GATT busy");
    await expect(t.send("B\n")).resolves.toBeUndefined();
  });

  it("disconnect closes the link and stops listening", async () => {
    const tx = fakeChar(NUS.write, { writeWithoutResponse: true });
    const rx = fakeChar(NUS.notify, { notify: true });
    const { device, server } = fakeDevice([NUS.service], { [NUS.service]: [tx, rx] });
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: async () => device } });
    const t = new WebBluetoothTransport();
    await t.connect();
    await t.disconnect();
    expect(t.connected).toBe(false);
    expect(rx.stopNotifications).toHaveBeenCalled();
    expect(server.disconnect).toHaveBeenCalled();
  });
});

describe("exploreDevice", () => {
  it("lists services and characteristics, reads values, and records notifications as a capture log", async () => {
    const svc = "12345678-1234-1234-1234-1234567890ab";
    const info = fakeChar("0000a001-0000-1000-8000-00805f9b34fb", { read: true });
    const stream = fakeChar("0000a002-0000-1000-8000-00805f9b34fb", { notify: true, writeWithoutResponse: true });
    const { device, server } = fakeDevice([svc], { [svc]: [info, stream] });
    const requestDevice = vi.fn(async () => device);
    vi.stubGlobal("navigator", { bluetooth: { requestDevice } });

    const p = exploreDevice([svc], 400);
    await vi.waitFor(() => expect(stream.startNotifications).toHaveBeenCalled());
    stream.notify("hi");
    const r = await p;

    expect(requestDevice).toHaveBeenCalledWith(expect.objectContaining({ acceptAllDevices: true, optionalServices: expect.arrayContaining([svc]) }));
    expect(r.deviceName).toBe("TestCutter");
    expect(r.services[0].characteristics[0]).toMatchObject({ properties: ["read"], value: "de ad" });
    expect(r.services[0].characteristics[1].properties).toEqual(["write-no-response", "notify"]);
    expect(info.writeValue).not.toHaveBeenCalled();
    expect(stream.writeValueWithoutResponse).not.toHaveBeenCalled(); // explorer never writes
    expect(server.disconnect).toHaveBeenCalled();

    // frames feed straight into the existing Cricut capture analyser
    const frames = parseCaptureLog(r.frames.join("\n"));
    expect(frames).toHaveLength(1);
    expect(Array.from(frames[0].bytes)).toEqual([0x68, 0x69]);
    expect(formatExploreReport(r).join("\n")).toContain(svc);
  });

  it("still disconnects when reading fails", async () => {
    const svc = "12345678-1234-1234-1234-1234567890ab";
    const bad = fakeChar("0000a001-0000-1000-8000-00805f9b34fb", { read: true });
    bad.readValue.mockRejectedValue(new Error("not permitted"));
    const { device, server } = fakeDevice([svc], { [svc]: [bad] });
    vi.stubGlobal("navigator", { bluetooth: { requestDevice: async () => device } });
    const r = await exploreDevice([], 0);
    expect(r.services[0].characteristics[0].readError).toBe("not permitted");
    expect(server.disconnect).toHaveBeenCalled();
  });
});
