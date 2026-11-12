import { describe, expect, it } from "vitest";
import { DEFAULT_LOCAL_PORTS, originAllowed, parseOriginList } from "./origin.mjs";

describe("originAllowed", () => {
  it("accepts CutDesk on its own local ports", () => {
    for (const o of ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:8304", "http://[::1]:3000"]) {
      expect(originAllowed(o), o).toBe(true);
    }
  });

  it("refuses other localhost ports", () => {
    for (const o of ["http://localhost:5173", "http://127.0.0.1:8080", "http://localhost", "https://localhost"]) {
      expect(originAllowed(o), o).toBe(false);
    }
  });

  it("accepts the desktop app", () => {
    expect(originAllowed("tauri://localhost")).toBe(true);
    expect(originAllowed("http://tauri.localhost")).toBe(true);
    expect(originAllowed("https://tauri.localhost")).toBe(true);
  });

  it("refuses other websites, including look-alikes", () => {
    for (const o of [
      "https://evil.example",
      "http://localhost.evil.example:3000",
      "http://127.0.0.1.evil.example:3000",
      "http://evil.example:3000",
      "https://evil.example@localhost:3000",
      "http://0.0.0.0:3000",
      "http://127.0.0.2:3000",
    ]) {
      expect(originAllowed(o), o).toBe(false);
    }
  });

  it("refuses missing, null, opaque and malformed origins", () => {
    for (const o of [undefined, null, "", "null", "not a url", "file:///etc/passwd", "ftp://localhost:3000", 42]) {
      expect(originAllowed(o), String(o)).toBe(false);
    }
  });

  it("accepts exactly the origins you list", () => {
    const extraOrigins = parseOriginList("http://192.168.1.10:8304, https://cut.example.com/");
    expect(originAllowed("http://192.168.1.10:8304", { extraOrigins })).toBe(true);
    expect(originAllowed("https://cut.example.com", { extraOrigins })).toBe(true);
    expect(originAllowed("http://192.168.1.10:9999", { extraOrigins })).toBe(false);
    expect(originAllowed("https://other.example.com", { extraOrigins })).toBe(false);
  });

  it("lets you change the local ports", () => {
    expect(originAllowed("http://localhost:5173", { localPorts: [5173] })).toBe(true);
    expect(originAllowed("http://localhost:3000", { localPorts: [5173] })).toBe(false);
  });

  it("ships a short default port list", () => {
    expect(DEFAULT_LOCAL_PORTS).toEqual([3000, 8304]);
  });
});

describe("parseOriginList", () => {
  it("splits on commas and spaces and trims trailing slashes", () => {
    expect([...parseOriginList("a/ , b  c,,")]).toEqual(["a", "b", "c"]);
    expect(parseOriginList(undefined).size).toBe(0);
  });
});
