const ALGORITHM = "RSA-OAEP";
const HASH = "SHA-256";
const KEY_USAGE_PRIVATE: KeyUsage[] = ["decrypt"];
const KEY_USAGES_PUBLIC: KeyUsage[] = ["encrypt"];
const IDB_DB = "sc_keys";
const IDB_STORE = "keypair";
const IDB_KEY = "main";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: ALGORITHM,
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: HASH,
    },
    true,
    [...KEY_USAGES_PUBLIC, ...KEY_USAGE_PRIVATE],
  );
}

function uint8ToBase64(uint8: Uint8Array): string {
  // Use a more memory-efficient approach for large buffers
  let binary = "";
  const len = uint8.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const buf = await crypto.subtle.exportKey("spki", key);
  return uint8ToBase64(new Uint8Array(buf));
}

export async function importPublicKey(b64: string): Promise<CryptoKey | null> {
  try {
    const buf = base64ToUint8(b64);
    return await crypto.subtle.importKey(
      "spki",
      buf,
      {
        name: ALGORITHM,
        hash: HASH,
      },
      false,
      KEY_USAGES_PUBLIC,
    );
  } catch (err) {
    console.error("Failed to import public key:", err);
    return null;
  }
}

export async function encrypt(
  plaintext: string,
  publicKey: CryptoKey,
): Promise<string> {
  const encoded = new TextEncoder().encode(plaintext);
  const buf = await crypto.subtle.encrypt(
    { name: ALGORITHM },
    publicKey,
    encoded,
  );
  return uint8ToBase64(new Uint8Array(buf));
}

export async function decrypt(
  ciphertext: string,
  privateKey: CryptoKey,
): Promise<string | null> {
  try {
    const buf = base64ToUint8(ciphertext);
    const decoded = await crypto.subtle.decrypt(
      { name: ALGORITHM },
      privateKey,
      buf,
    );
    return new TextDecoder().decode(decoded);
  } catch (err) {
    console.error("Decryption failed:", err);
    return null;
  }
}

export async function persistKeyPair(pair: CryptoKeyPair): Promise<void> {
  const db = await openDb();
  const [pub, priv] = await Promise.all([
    crypto.subtle.exportKey("spki", pair.publicKey),
    crypto.subtle.exportKey("pkcs8", pair.privateKey),
  ]);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put({ pub, priv }, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPersistedKeyPair(): Promise<CryptoKeyPair | null> {
  const db = await openDb();
  const raw = await new Promise<
    { pub: ArrayBuffer; priv: ArrayBuffer } | undefined
  >((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () =>
      resolve(
        req.result as { pub: ArrayBuffer; priv: ArrayBuffer } | undefined,
      );
    req.onerror = () => reject(req.error);
  });

  if (!raw) return null;

  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.importKey(
      "spki",
      raw.pub,
      {
        name: ALGORITHM,
        hash: HASH,
      },
      true,
      KEY_USAGES_PUBLIC,
    ),
    crypto.subtle.importKey(
      "pkcs8",
      raw.priv,
      {
        name: ALGORITHM,
        hash: HASH,
      },
      false,
      KEY_USAGE_PRIVATE,
    ),
  ]);

  return { publicKey, privateKey };
}
