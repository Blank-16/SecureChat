import {
  AES_ALGORITHM,
  AES_IV_LENGTH,
  AES_KEY_LENGTH,
  IDB_DB,
  IDB_KEY,
  IDB_STORE,
  KEY_USAGES_PUBLIC,
  KEY_USAGE_PRIVATE,
  PBKDF2_HASH,
  PBKDF2_ITERATIONS,
  PBKDF2_SALT_LENGTH,
  RSA_ALGORITHM,
  RSA_HASH,
  PersistedKeyData,
} from "./constants";
import { CryptoError, toBuffer } from "./helpers";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new CryptoError("IndexedDB is not available in this environment"));
      return;
    }
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(
        new CryptoError("Failed to open key database", { cause: req.error }),
      );
  });
}

/**
 * Derives a key wrapping key from a user passphrase using PBKDF2.
 */
async function deriveWrappingKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    baseKey,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/**
 * Persists a generated keypair to IndexedDB:
 * 1. Derives an AES wrapping key from the passphrase using PBKDF2.
 * 2. Encrypts (wraps) the PKCS#8 private key using this derived AES wrapping key.
 * 3. Stores the public key (SPKI format) and the wrapped private key securely at rest.
 */
export async function persistKeyPair(
  pair: CryptoKeyPair,
  passphrase: string,
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH));
  const wrappingKey = await deriveWrappingKey(passphrase, salt);

  const [pub, wrappedPriv] = await Promise.all([
    crypto.subtle.exportKey("spki", pair.publicKey),
    crypto.subtle.wrapKey("pkcs8", pair.privateKey, wrappingKey, {
      name: AES_ALGORITHM,
      iv: toBuffer(iv),
    }),
  ]);

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put({ pub, wrappedPriv, salt, iv }, IDB_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(
        new CryptoError("Failed to persist key pair", { cause: tx.error }),
      );
    };
  });
}

/**
 * Loads a persisted keypair from IndexedDB:
 * 1. Pulls the public key and wrapped private key from the database.
 * 2. Re-derives the wrapping key using the stored salt and the user's passphrase.
 * 3. Decrypts (unwraps) the private key and reconstructs the CryptoKeyPair.
 */
export async function loadPersistedKeyPair(
  passphrase: string,
): Promise<CryptoKeyPair | null> {
  const db = await openDb();

  const raw = await new Promise<PersistedKeyData | undefined>(
    (resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result as PersistedKeyData | undefined);
      req.onerror = () =>
        reject(
          new CryptoError("Failed to read key data", { cause: req.error }),
        );
      tx.oncomplete = () => db.close();
    },
  );

  if (!raw) return null;

  const wrappingKey = await deriveWrappingKey(passphrase, raw.salt);

  try {
    const [publicKey, privateKey] = await Promise.all([
      crypto.subtle.importKey(
        "spki",
        raw.pub,
        { name: RSA_ALGORITHM, hash: RSA_HASH },
        true,
        KEY_USAGES_PUBLIC,
      ),
      crypto.subtle.unwrapKey(
        "pkcs8",
        raw.wrappedPriv,
        wrappingKey,
        { name: AES_ALGORITHM, iv: toBuffer(raw.iv) },
        { name: RSA_ALGORITHM, hash: RSA_HASH },
        false,
        KEY_USAGE_PRIVATE,
      ),
    ]);
    return { publicKey, privateKey };
  } catch (err) {
    throw new CryptoError(
      "Failed to load key pair — incorrect passphrase or corrupted data",
      { cause: err },
    );
  }
}
