/**
 * Remote catalog loader. Points the gallery at a JSON manifest hosted anywhere
 * (your Stix N Vibes shop, a CDN bucket, a static file) so your real library —
 * thousands of designs — shows up in CutDesk without bundling anything.
 *
 * The manifest is untrusted remote data, so it's validated with zod before use.
 * Two item kinds:
 *   - "path"  → cut-ready vector (SVG path `d`, bbox starting at 0,0, in mm)
 *   - "image" → a PNG/SVG at `url`, placed as a reference image you trace to cut
 *
 * The host must send CORS headers (Access-Control-Allow-Origin) for the fetch to
 * work from the browser; image items are fetched to a data URL so they trace and
 * stay with saved projects.
 */

import { z } from "zod";

const ItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional(),
  type: z.enum(["path", "image"]),
  d: z.string().optional(),
  url: z.string().url().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

const CatalogSchema = z.object({
  version: z.number().optional(),
  name: z.string().optional(),
  items: z.array(ItemSchema),
});

export type RemoteItem = z.infer<typeof ItemSchema>;

const URL_KEY = "cutdesk-catalog-url";

export function getCatalogUrl(): string {
  try {
    return localStorage.getItem(URL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setCatalogUrl(url: string): void {
  try {
    localStorage.setItem(URL_KEY, url);
  } catch {
    // storage unavailable; the URL just won't be remembered
  }
}

/** Fetch and validate a catalog manifest, keeping only usable items. */
export async function fetchCatalog(url: string): Promise<RemoteItem[]> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Catalog responded ${res.status}. Check the URL.`);
  const json: unknown = await res.json();
  const parsed = CatalogSchema.safeParse(json);
  if (!parsed.success) throw new Error("That URL isn't a valid CutDesk catalog manifest.");
  return parsed.data.items.filter((i) => (i.type === "path" ? !!i.d : !!i.url));
}

/** Fetch a remote image into a data URL plus its pixel size (needs CORS). */
export async function loadRemoteImage(url: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image responded ${res.status}.`);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the image."));
    reader.readAsDataURL(blob);
  });
  const size = await new Promise<{ width: number; height: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = dataUrl;
  });
  return { dataUrl, ...size };
}
