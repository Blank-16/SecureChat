import type { Message } from "../types";

const DB_NAME = "SecureChatCache";
const STORE_NAME = "messages";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("peer", "peer", { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });

  return dbPromise;
}

export async function cacheMessage(peer: string, msg: Message): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    
    // Strip plaintext for security (store ciphertext only)
    const { plaintext, decryptError, ...secureMsg } = msg;

    store.put({
      ...secureMsg,
      peer,
    });
  } catch (err) {
    console.error("IndexedDB write failed:", err);
  }
}

export async function getCachedMessages(peer: string): Promise<Message[]> {
  try {
    const db = await getDB();
    return new Promise<Message[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("peer");
      const request = index.getAll(peer);

      request.onsuccess = () => {
        const msgs = request.result as Array<Message & { peer: string }>;
        // Sort by timestamp
        const sorted = msgs
          .map(({ peer: _, ...msg }) => msg)
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        resolve(sorted);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error("IndexedDB read failed:", err);
    return [];
  }
}

export async function clearCache(): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();
  } catch (err) {
    console.error("IndexedDB clear failed:", err);
  }
}
