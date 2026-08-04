/**
 * Offline-First IndexedDB Synchronization Queue
 * 
 * Manages cached actions (such as completing tasks, capturing receipt photos,
 * and checking off grocery runs) during network disruptions.
 */

export interface OfflineQueueItem {
  id: string;
  action: "complete_ticket" | "buy_grocery" | "toggle_bought" | "update_status";
  payload: any;
  binaryPhoto?: string | null; // stored as base64 string for ease of serialization & preview
  timestamp: number;
}

const DB_NAME = "linara_offline_db";
const STORE_NAME = "offline_queue";
const DB_VERSION = 1;

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported or not running in a browser environment"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

/**
 * Adds an item to the offline sync queue.
 */
export async function addToQueue(
  action: OfflineQueueItem["action"],
  payload: any,
  binaryPhoto?: string | null
): Promise<OfflineQueueItem> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const newItem: OfflineQueueItem = {
      id: `off-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      action,
      payload,
      binaryPhoto: binaryPhoto || null,
      timestamp: Date.now(),
    };

    const request = store.add(newItem);
    request.onsuccess = () => resolve(newItem);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves all items in the offline queue, sorted by timestamp.
 */
export async function getQueue(): Promise<OfflineQueueItem[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = request.result as OfflineQueueItem[];
      resolve(items.sort((a, b) => a.timestamp - b.timestamp));
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Removes an item from the queue by its ID.
 */
export async function removeFromQueue(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clears the entire offline sync queue.
 */
export async function clearQueue(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
