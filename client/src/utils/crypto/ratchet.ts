import { ECDH_ALGORITHM, AES_ALGORITHM, AES_KEY_LENGTH } from "./constants";
import { CryptoError } from "./helpers";
import { uint8ToBase64, base64ToUint8, toBuffer } from "./helpers";

// Maximum number of out-of-order message keys cached per session.
const MAX_SKIP = 100;

// HKDF-based key derivation. Keys are non-extractable by default so raw
// bytes cannot be exported from the browser by XSS code.
async function hkdf(ikm: CryptoKey, salt: Uint8Array, info: string, extractable = false): Promise<CryptoKey> {
  const infoBuf = new TextEncoder().encode(info);

  const baseKey = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.exportKey("raw", ikm),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toBuffer(salt),
      info: infoBuf,
    },
    baseKey,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    extractable,
    ["encrypt", "decrypt"],
  );
}

interface SkippedKeyEntry {
  index: number;
  // Raw exported message key (base64). Message keys are single-use and
  // short-lived, so brief extractability here is an acceptable tradeoff
  // for IndexedDB persistence of out-of-order messages.
  keyB64: string;
}

export interface SessionState {
  peerUsername: string;
  sendChainKey: CryptoKey;
  receiveChainKey: CryptoKey;
  sendIndex: number;
  receiveIndex: number;
  hkdfSaltB64: string;
  skippedKeys: SkippedKeyEntry[];
}

const DB_NAME = "SecureChatSessions";
const STORE_NAME = "sessions";

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "peerUsername" });
      }
    };
    request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
  });
  return dbPromise;
}

async function saveSession(session: SessionState): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSession(peerUsername: string): Promise<SessionState | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(peerUsername);
    request.onsuccess = () => resolve(request.result as SessionState | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllSessions(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function initializeSession(
  peerUsername: string,
  myEphemeralPriv: CryptoKey,
  peerPreKeyPub: CryptoKey,
  isInitiator: boolean,
): Promise<void> {
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: ECDH_ALGORITHM, public: peerPreKeyPub },
    myEphemeralPriv,
    256,
  );

  const sharedSecret = await crypto.subtle.importKey(
    "raw",
    sharedSecretBits,
    { name: "HKDF" },
    false,
    ["deriveKey"],
  );

  // Random per-session salt (RFC 5869 recommends random salt over a fixed string).
  const sessionSalt = crypto.getRandomValues(new Uint8Array(32));

  const rootKey = await hkdf(sharedSecret, sessionSalt, "RootKey");
  const aliceChain = await hkdf(rootKey, sessionSalt, "AliceChain");
  const bobChain = await hkdf(rootKey, sessionSalt, "BobChain");

  const session: SessionState = {
    peerUsername,
    sendChainKey: isInitiator ? aliceChain : bobChain,
    receiveChainKey: isInitiator ? bobChain : aliceChain,
    sendIndex: 0,
    receiveIndex: 0,
    hkdfSaltB64: uint8ToBase64(sessionSalt),
    skippedKeys: [],
  };
  await saveSession(session);
}

export interface RatchetSendResult {
  messageKey: CryptoKey;
  msgIndex: number;
}

export async function ratchetSendKey(peerUsername: string): Promise<RatchetSendResult> {
  const session = await getSession(peerUsername);
  if (!session) throw new CryptoError("Session not initialized");

  const salt = base64ToUint8(session.hkdfSaltB64);
  const messageKey = await hkdf(session.sendChainKey, salt, "MessageKey");
  const msgIndex = session.sendIndex;

  session.sendChainKey = await hkdf(session.sendChainKey, salt, "ChainKey");
  session.sendIndex += 1;
  await saveSession(session);
  return { messageKey, msgIndex };
}

// Advances the receive chain to targetIndex, caching skipped message keys
// so out-of-order messages can still be decrypted. Bounded by MAX_SKIP.
export async function ratchetReceiveKey(peerUsername: string, targetIndex: number): Promise<CryptoKey> {
  const session = await getSession(peerUsername);
  if (!session) throw new CryptoError("Session not initialized");

  const salt = base64ToUint8(session.hkdfSaltB64);

  const cached = session.skippedKeys.find((k) => k.index === targetIndex);
  if (cached) {
    const key = await crypto.subtle.importKey(
      "raw",
      toBuffer(base64ToUint8(cached.keyB64)),
      { name: AES_ALGORITHM },
      false,
      ["encrypt", "decrypt"],
    );
    session.skippedKeys = session.skippedKeys.filter((k) => k.index !== targetIndex);
    await saveSession(session);
    return key;
  }

  if (targetIndex < session.receiveIndex) {
    throw new CryptoError("Message key already consumed and not cached (replay or too old)");
  }

  if (targetIndex - session.receiveIndex > MAX_SKIP) {
    throw new CryptoError("Too many skipped messages — refusing to ratchet forward");
  }

  let messageKey: CryptoKey | undefined;
  while (session.receiveIndex <= targetIndex) {
    const isTarget = session.receiveIndex === targetIndex;
    const mk = await hkdf(session.receiveChainKey, salt, "MessageKey", !isTarget);
    if (isTarget) {
      messageKey = mk;
    } else {
      // Cache skipped key as exportable bytes; consumed (deleted) on use.
      const raw = await crypto.subtle.exportKey("raw", mk);
      session.skippedKeys.push({ index: session.receiveIndex, keyB64: uint8ToBase64(new Uint8Array(raw)) });
      if (session.skippedKeys.length > MAX_SKIP) session.skippedKeys.shift();
    }
    session.receiveChainKey = await hkdf(session.receiveChainKey, salt, "ChainKey");
    session.receiveIndex += 1;
  }

  await saveSession(session);
  if (!messageKey) throw new CryptoError("Failed to derive message key");
  return messageKey;
}

export async function hasSession(peerUsername: string): Promise<boolean> {
  return !!(await getSession(peerUsername));
}
