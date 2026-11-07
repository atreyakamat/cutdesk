import { afterEach, describe, expect, it } from "vitest";
import { fetchCatalog } from "./remote";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(body: unknown, ok = true, status = 200) {
  globalThis.fetch = (async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("fetchCatalog (untrusted remote manifest)", () => {
  it("accepts a valid manifest with path and image items", async () => {
    mockFetch({
      version: 1,
      name: "Test",
      items: [
        { id: "a", name: "Heart", type: "path", d: "M0 0 L10 10 Z", width: 60, height: 60 },
        { id: "b", name: "Logo", type: "image", url: "https://cdn.example.com/x.svg", width: 80, height: 40 },
      ],
    });
    const items = await fetchCatalog("https://example.com/c.json");
    expect(items).toHaveLength(2);
  });

  it("drops items missing their geometry (path without d, image without url)", async () => {
    mockFetch({
      items: [
        { id: "a", name: "ok", type: "path", d: "M0 0 L1 1 Z" },
        { id: "b", name: "no-d", type: "path" },
        { id: "c", name: "no-url", type: "image" },
        { id: "d", name: "ok-img", type: "image", url: "https://e.com/a.png" },
      ],
    });
    const items = await fetchCatalog("https://example.com/c.json");
    expect(items.map((i) => i.id).sort()).toEqual(["a", "d"]);
  });

  it("rejects a non-manifest payload", async () => {
    mockFetch({ foo: "bar" });
    await expect(fetchCatalog("https://example.com/c.json")).rejects.toThrow(/valid CutDesk catalog/);
  });

  it("rejects a bad URL value in an image item by dropping it, not crashing", async () => {
    mockFetch({ items: [{ id: "x", name: "bad", type: "image", url: "not-a-url" }] });
    // z.string().url() fails the whole parse -> treated as invalid manifest.
    await expect(fetchCatalog("https://example.com/c.json")).rejects.toThrow();
  });

  it("throws on a non-ok HTTP response", async () => {
    mockFetch({}, false, 404);
    await expect(fetchCatalog("https://example.com/c.json")).rejects.toThrow(/404/);
  });
});
