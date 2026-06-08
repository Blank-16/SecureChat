import {
  AES_ALGORITHM,
  AES_IV_LENGTH,
  AES_KEY_LENGTH,
  IDB_DB,
  IDB_KEY,
  IDB_STORE,
  PBKDF2_HASH,
  PBKDF2_ITERATIONS,
  PBKDF2_SALT_LENGTH,
  ECDSA_ALGORITHM,
  ECDSA_CURVE,
  ECDH_ALGORITHM,
  PersistedKeyData,
} from "./constants";
import { CryptoError, toBuffer } from "./helpers";
import { signData, exportPublicKey } from "./keys";

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

export async function persistKeyPairs(
  identityKeyPair: CryptoKeyPair,
  preKeyPair: CryptoKeyPair,
  passphrase: string,
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_LENGTH));
  const ivIdentity = crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH));
  const ivPreKey = crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH));
  const wrappingKey = await deriveWrappingKey(passphrase, salt);

  const [identityPub, identityWrappedPriv, preKeyPub, preKeyWrappedPriv] = await Promise.all([
    crypto.subtle.exportKey("spki", identityKeyPair.publicKey),
    crypto.subtle.wrapKey("pkcs8", identityKeyPair.privateKey, wrappingKey, {
      name: AES_ALGORITHM,
      iv: toBuffer(ivIdentity),
    }),
    crypto.subtle.exportKey("spki", preKeyPair.publicKey),
    crypto.subtle.wrapKey("pkcs8", preKeyPair.privateKey, wrappingKey, {
      name: AES_ALGORITHM,
      iv: toBuffer(ivPreKey),
    }),
  ]);

  const preKeyPubBase64 = await exportPublicKey(preKeyPair.publicKey);
  const preKeySignature = await signData(identityKeyPair.privateKey, new TextEncoder().encode(preKeyPubBase64));

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put({
      identityPub,
      identityWrappedPriv,
      preKeyPub,
      preKeyWrappedPriv,
      preKeySignature,
      salt,
      ivIdentity,
      ivPreKey
    }, IDB_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(
        new CryptoError("Failed to persist key pairs", { cause: tx.error }),
      );
    };
  });
}

export async function loadPersistedKeyPairs(
  passphrase: string,
): Promise<{ identityKeyPair: CryptoKeyPair, preKeyPair: CryptoKeyPair, preKeySignature: string } | null> {
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
    const [identityPub, identityPriv, preKeyPub, preKeyPriv] = await Promise.all([
      crypto.subtle.importKey(
        "spki",
        raw.identityPub,
        { name: ECDSA_ALGORITHM, namedCurve: ECDSA_CURVE },
        true,
        ["verify"],
      ),
      crypto.subtle.unwrapKey(
        "pkcs8",
        raw.identityWrappedPriv,
        wrappingKey,
        { name: AES_ALGORITHM, iv: toBuffer(raw.ivIdentity) },
        { name: ECDSA_ALGORITHM, namedCurve: ECDSA_CURVE },
        false,
        ["sign"],
      ),
      crypto.subtle.importKey(
        "spki",
        raw.preKeyPub,
        { name: ECDH_ALGORITHM, namedCurve: ECDSA_CURVE },
        true,
        [],
      ),
      crypto.subtle.unwrapKey(
        "pkcs8",
        raw.preKeyWrappedPriv,
        wrappingKey,
        { name: AES_ALGORITHM, iv: toBuffer(raw.ivPreKey) },
        { name: ECDH_ALGORITHM, namedCurve: ECDSA_CURVE },
        false,
        ["deriveKey", "deriveBits"],
      ),
    ]);
    return {
      identityKeyPair: { publicKey: identityPub, privateKey: identityPriv },
      preKeyPair: { publicKey: preKeyPub, privateKey: preKeyPriv },
      preKeySignature: raw.preKeySignature
    };
  } catch (err) {
    throw new CryptoError(
      "Failed to load key pair — incorrect passphrase or corrupted data",
      { cause: err },
    );
  }
}
