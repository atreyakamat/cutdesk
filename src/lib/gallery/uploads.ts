/**
 * Local image gallery, persisted in the browser with IndexedDB. Uploaded images
 * stay on this device (private, offline) and can be dropped onto the mat as
 * reference art or traced into cut paths. Every access is wrapped so a blocked
 * or private-mode IndexedDB degrades gracefully instead of throwing.
 */

export interface Upload {
  id: string;
  name: string;
  /** Data URL of the image bytes. */
  dataUrl: string;
  /** Natural pixel dimensions, used to keep aspect ratio when placing. */
  width: number;
  height: number;
  createdAt: number;
}

const DB_NAME = "cutdesk";
const STORE = "uploads";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser has no local storage for the gallery."));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Couldn't open the gallery database."));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Gallery operation failed."));
      }),
  );
}

function readImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = dataUrl;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the file."));
    reader.readAsDataURL(file);
  });
}

export async function saveUpload(file: File): Promise<Upload> {
  const dataUrl = await readAsDataUrl(file);
  const { width, height } = await readImageSize(dataUrl);
  const upload: Upload = {
    id: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: file.name || "image",
    dataUrl,
    width,
    height,
    createdAt: Date.now(),
  };
  await tx("readwrite", (store) => store.put(upload));
  return upload;
}

export async function listUploads(): Promise<Upload[]> {
  const all = await tx<Upload[]>("readonly", (store) => store.getAll() as IDBRequest<Upload[]>);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteUpload(id: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(id));
}
