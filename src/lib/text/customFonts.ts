/**
 * Custom fonts the user uploads (.ttf / .otf / .woff). The font bytes are stored
 * locally in IndexedDB (private, offline) and registered into the opentype.js
 * cache so text can be outlined and cut with them. A separate database from the
 * image gallery so the two never fight over a schema version.
 *
 * Text geometry bakes its outline `d`, so a design still renders if a custom
 * font is missing later — only re-editing that text needs the font present.
 */

import { parse } from "opentype.js";
import { registerFont } from "./fonts";

export interface CustomFontMeta {
  id: string;
  label: string;
}

interface CustomFontRecord extends CustomFontMeta {
  bytes: ArrayBuffer;
  createdAt: number;
}

const DB_NAME = "cutdesk-fonts";
const STORE = "fonts";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser has no local storage for fonts."));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Couldn't open the font database."));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Font operation failed."));
      }),
  );
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the font file."));
    reader.readAsArrayBuffer(file);
  });
}

/** Parse, validate, store and register an uploaded font. Throws on an unreadable file. */
export async function saveCustomFont(file: File): Promise<CustomFontMeta> {
  const bytes = await readAsArrayBuffer(file);
  // parse throws on anything opentype.js can't read (incl. WOFF2) — surface it.
  let font;
  try {
    font = parse(bytes);
  } catch {
    throw new Error("That file isn't a readable font (.ttf, .otf or .woff — not .woff2).");
  }
  const rec: CustomFontRecord = {
    id: `cf${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    label: file.name.replace(/\.[^.]+$/, "") || "Custom font",
    bytes,
    createdAt: Date.now(),
  };
  await tx("readwrite", (store) => store.put(rec));
  registerFont(rec.id, font);
  return { id: rec.id, label: rec.label };
}

export async function listCustomFonts(): Promise<CustomFontMeta[]> {
  try {
    const all = await tx<CustomFontRecord[]>("readonly", (store) => store.getAll() as IDBRequest<CustomFontRecord[]>);
    return all.sort((a, b) => a.createdAt - b.createdAt).map(({ id, label }) => ({ id, label }));
  } catch {
    return [];
  }
}

/** Parse every stored font and register it into the cache. Call once at startup. */
export async function loadCustomFontsIntoCache(): Promise<CustomFontMeta[]> {
  let all: CustomFontRecord[];
  try {
    all = await tx<CustomFontRecord[]>("readonly", (store) => store.getAll() as IDBRequest<CustomFontRecord[]>);
  } catch {
    return [];
  }
  const metas: CustomFontMeta[] = [];
  for (const rec of all.sort((a, b) => a.createdAt - b.createdAt)) {
    try {
      registerFont(rec.id, parse(rec.bytes));
      metas.push({ id: rec.id, label: rec.label });
    } catch {
      // Skip a record that can no longer be parsed.
    }
  }
  return metas;
}

export async function deleteCustomFont(id: string): Promise<void> {
  try {
    await tx("readwrite", (store) => store.delete(id));
  } catch {
    // Nothing to do if storage is unavailable.
  }
}
