import { ECDH_ALGORITHM, AES_ALGORITHM, AES_KEY_LENGTH } from "./constants";
import { CryptoError } from "./helpers";


// HKDF-based derivation
async function hkdf(ikm: CryptoKey, salt: string, info: string): Promise<CryptoKey> {
  const saltBuf = new TextEncoder().encode(salt);
  const infoBuf = new TextEncoder().encode(info);
  
  const baseKey = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.exportKey("raw", ikm),
    "HKDF",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: saltBuf,
      info: infoBuf,
    },
    baseKey,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
}

export interface SessionState {
  peerUsername: string;
  sendChainKey: CryptoKey;
  receiveChainKey: CryptoKey;
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
  isInitiator: boolean
): Promise<void> {
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: ECDH_ALGORITHM, public: peerPreKeyPub },
    myEphemeralPriv,
    256
  );
  
  const sharedSecret = await crypto.subtle.importKey(
    "raw",
    sharedSecretBits,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  const rootKey = await hkdf(sharedSecret, "SecureChatSalt", "RootKey");
  const aliceChain = await hkdf(rootKey, "SecureChatSalt", "AliceChain");
  const bobChain = await hkdf(rootKey, "SecureChatSalt", "BobChain");

  const session: SessionState = {
    peerUsername,
    sendChainKey: isInitiator ? aliceChain : bobChain,
    receiveChainKey: isInitiator ? bobChain : aliceChain,
  };
  await saveSession(session);
}

export async function ratchetSendKey(peerUsername: string): Promise<CryptoKey> {
  const session = await getSession(peerUsername);
  if (!session) throw new CryptoError("Session not initialized");

  const messageKey = await hkdf(session.sendChainKey, "SecureChatSalt", "MessageKey");
  session.sendChainKey = await hkdf(session.sendChainKey, "SecureChatSalt", "ChainKey");
  await saveSession(session);
  return messageKey;
}

export async function ratchetReceiveKey(peerUsername: string): Promise<CryptoKey> {
  const session = await getSession(peerUsername);
  if (!session) throw new CryptoError("Session not initialized");

  const messageKey = await hkdf(session.receiveChainKey, "SecureChatSalt", "MessageKey");
  session.receiveChainKey = await hkdf(session.receiveChainKey, "SecureChatSalt", "ChainKey");
  await saveSession(session);
  return messageKey;
}

export async function hasSession(peerUsername: string): Promise<boolean> {
  const s = await getSession(peerUsername);
  return !!s;
}
