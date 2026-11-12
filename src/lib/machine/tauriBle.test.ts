import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const handlers = new Map<string, (e: { payload: unknown }) => void>();
const unlisten = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, fn: (e: { payload: unknown }) => void) => {
    handlers.set(name, fn);
    return () => {
      unlisten(name);
      handlers.delete(name);
    };
  },
}));

import { formatNativeExplore, TauriBleTransport } from "./tauriBle";

beforeEach(() => {
  invoke.mockReset();
  unlisten.mockReset();
  handlers.clear();
});

describe("TauriBleTransport", () => {
  it("connects by device id and relays data from the machine", async () => {
    invoke.mockResolvedValue("Nordic UART");
    const t = new TauriBleTransport("AA:BB");
    const heard: string[] = [];
    t.subscribe((c) => heard.push(c));
    await t.connect();
    expect(invoke).toHaveBeenCalledWith("ble_connect", { id: "AA:BB" });
    expect(t.connected).toBe(true);
    handlers.get("ble-data")?.({ payload: "ok\r\n" });
    expect(heard.join("")).toBe("ok\r\n");
  });

  it("stops listening and rethrows when connecting fails", async () => {
    invoke.mockRejectedValue("This device has no serial-over-Bluetooth service");
    const t = new TauriBleTransport("AA:BB");
    await expect(t.connect()).rejects.toThrow(/no serial-over-Bluetooth service/);
    expect(t.connected).toBe(false);
    expect(handlers.size).toBe(0);
  });

  it("reports a lost connection", async () => {
    invoke.mockResolvedValue("x");
    const t = new TauriBleTransport("id");
    const heard: string[] = [];
    t.subscribe((c) => heard.push(c));
    await t.connect();
    handlers.get("ble-disconnected")?.({ payload: null });
    expect(t.connected).toBe(false);
    expect(heard.join("")).toMatch(/connection lost/);
    await expect(t.send("M5\n")).rejects.toThrow(/isn't connected/);
  });

  it("sends through the native write command and turns native errors into Errors", async () => {
    invoke.mockResolvedValue(undefined);
    const t = new TauriBleTransport("id");
    await t.connect();
    await t.send("G1 X1\n");
    expect(invoke).toHaveBeenCalledWith("ble_write", { data: "G1 X1\n" });
    invoke.mockRejectedValueOnce("Bluetooth write failed: busy");
    await expect(t.send("A\n")).rejects.toThrow("Bluetooth write failed: busy");
  });

  it("disconnect closes the link and removes listeners", async () => {
    invoke.mockResolvedValue(undefined);
    const t = new TauriBleTransport("id");
    await t.connect();
    await t.disconnect();
    expect(invoke).toHaveBeenCalledWith("ble_disconnect");
    expect(t.connected).toBe(false);
    expect(handlers.size).toBe(0);
  });

  it("scan labels devices with their signal strength", async () => {
    invoke.mockResolvedValue([
      { id: "1", name: "Cutter", rssi: -50 },
      { id: "2", name: "(unnamed)", rssi: null },
    ]);
    expect(await TauriBleTransport.scan()).toEqual([
      { path: "1", label: "Cutter (-50 dBm)" },
      { path: "2", label: "(unnamed)" },
    ]);
    expect(invoke).toHaveBeenCalledWith("ble_scan", { timeoutMs: 4000 });
  });

  it("explore asks the native side, read-only", async () => {
    invoke.mockResolvedValue({ device_name: "X", services: [], frames: [] });
    await TauriBleTransport.explore("1", 500);
    expect(invoke).toHaveBeenCalledWith("ble_explore", { id: "1", listenMs: 500 });
    expect(invoke).not.toHaveBeenCalledWith("ble_write", expect.anything());
  });
});

describe("formatNativeExplore", () => {
  it("lists services, properties and values", () => {
    const lines = formatNativeExplore({
      device_name: "Maker",
      services: [
        {
          uuid: "svc-1",
          characteristics: [
            { uuid: "c-1", properties: ["read"], value: "de ad", read_error: null },
            { uuid: "c-2", properties: [], value: null, read_error: "not permitted" },
          ],
        },
      ],
      frames: ["rx 01"],
    });
    expect(lines[0]).toBe("Device: Maker");
    expect(lines.join("\n")).toContain("c-1  [read]  = de ad");
    expect(lines.join("\n")).toContain("c-2  [no access]  (not permitted)");
    expect(lines.at(-1)).toMatch(/Heard 1 notification/);
  });
  it("says so when nothing is visible", () => {
    expect(formatNativeExplore({ device_name: "X", services: [], frames: [] })).toContain("No services were visible.");
  });
});
