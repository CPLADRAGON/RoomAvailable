import type { VenueMatrix } from "@/types";

// Bump to invalidate all cached data (e.g. when the normalized shape changes).
export const DATA_SCHEMA_VERSION = 3;

const DB_NAME = "spacefinder";
const STORE = "venue-data";
const RECORD_KEY = "current";
const SW_CACHE = "spacefinder-data-v" + DATA_SCHEMA_VERSION;

// Refresh at most once every 12 hours.
export const TTL_MS = 12 * 60 * 60 * 1000;

interface CacheRecord {
  version: number;
  fetchedAt: number;
  data: VenueMatrix;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DATA_SCHEMA_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Drop any stale stores from prior schema versions.
      for (const name of Array.from(db.objectStoreNames)) {
        db.deleteObjectStore(name);
      }
      db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function readCache(): Promise<CacheRecord | null> {
  try {
    const db = await openDB();
    return await new Promise<CacheRecord | null>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(RECORD_KEY);
      req.onsuccess = () => {
        const rec = req.result as CacheRecord | undefined;
        if (!rec || rec.version !== DATA_SCHEMA_VERSION) resolve(null);
        else resolve(rec);
      };
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

export async function writeCache(data: VenueMatrix): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const rec: CacheRecord = {
        version: DATA_SCHEMA_VERSION,
        fetchedAt: Date.now(),
        data,
      };
      tx.objectStore(STORE).put(rec, RECORD_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => resolve();
    });
  } catch {
    // best-effort cache; ignore failures
  }
}

export function isStale(fetchedAt: number): boolean {
  return Date.now() - fetchedAt > TTL_MS;
}

// Wipe everything this app stores: IndexedDB record + service-worker caches.
export async function clearCache(): Promise<void> {
  try {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  } catch {
    /* ignore */
  }
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("spacefinder"))
          .map((k) => caches.delete(k))
      );
    }
  } catch {
    /* ignore */
  }
  // Unregister the service worker so a stale app shell can't keep serving old code.
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }
  void SW_CACHE;
}
