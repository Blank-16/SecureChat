import { AES_ALGORITHM, AES_IV_LENGTH } from "./constants";
import { CryptoError, base64ToUint8, uint8ToBase64, toBuffer } from "./helpers";
import { hasSession, initializeSession, ratchetSendKey, ratchetReceiveKey } from "./ratchet";
import { generatePreKeyPair, exportPublicKey, importPrePublicKey, importIdentityPublicKey, verifySignature } from "./keys";
import { useCryptoStore } from "../../store/cryptoStore";

export async function encryptMessage(plaintext: string, messageKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const encryptedData = new Uint8Array(
    (await crypto.subtle.encrypt({ name: AES_ALGORITHM, iv }, messageKey, encoded)) as ArrayBuffer,
  );

  const combined = new Uint8Array(AES_IV_LENGTH + encryptedData.length);
  combined.set(iv, 0);
  combined.set(encryptedData, AES_IV_LENGTH);
  return uint8ToBase64(combined);
}

export async function decryptMessage(ciphertext: string, messageKey: CryptoKey): Promise<string> {
  const combined = base64ToUint8(ciphertext);

  if (combined.length < AES_IV_LENGTH) {
    throw new CryptoError("Malformed ciphertext: too short");
  }

  const iv = combined.slice(0, AES_IV_LENGTH);
  const encryptedData = combined.slice(AES_IV_LENGTH);

  try {
    const decoded = (await crypto.subtle.decrypt(
      { name: AES_ALGORITHM, iv },
      messageKey,
      encryptedData,
    )) as ArrayBuffer;
    return new TextDecoder().decode(decoded);
  } catch (err) {
    throw new CryptoError("Decryption failed — ciphertext may be tampered or corrupted", { cause: err });
  }
}

export async function encryptRatchet(
  peerUsername: string,
  text: string,
  peerIdentityB64: string,
  peerPreKeyB64: string,
  peerPreKeySig: string,
): Promise<string> {
  let ephemeralPubStr = "";

  if (!(await hasSession(peerUsername))) {
    const peerIdentityKey = await importIdentityPublicKey(peerIdentityB64);
    const valid = await verifySignature(peerIdentityKey, peerPreKeySig, new TextEncoder().encode(peerPreKeyB64));
    if (!valid) throw new CryptoError("Invalid peer PreKey signature");

    const ephemeralPair = await generatePreKeyPair();
    ephemeralPubStr = await exportPublicKey(ephemeralPair.publicKey);

    const peerPreKey = await importPrePublicKey(peerPreKeyB64);
    await initializeSession(peerUsername, ephemeralPair.privateKey, peerPreKey, true);
  }

  const { messageKey, msgIndex } = await ratchetSendKey(peerUsername);
  const rawCiphertext = await encryptMessage(text, messageKey);

  // Include ek (ephemeral key) on session init; idx enables receiver-side
  // out-of-order detection and skipped-key caching.
  return JSON.stringify({
    ek: ephemeralPubStr || undefined,
    ct: rawCiphertext,
    idx: msgIndex,
  });
}

export async function decryptRatchet(peerUsername: string, payloadStr: string): Promise<string> {
  let payload: { ek?: string; ct: string; idx: number };
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    throw new CryptoError("Invalid payload format");
  }
  if (typeof payload.idx !== "number") {
    throw new CryptoError("Invalid payload: missing message index");
  }

  if (!(await hasSession(peerUsername))) {
    if (!payload.ek) throw new CryptoError("Session uninitialized and no ephemeral key provided");

    const myPreKeyPriv = useCryptoStore.getState().preKeyPrivateKey;
    if (!myPreKeyPriv) throw new CryptoError("Local PreKey not ready");

    const peerEphemeralPub = await importPrePublicKey(payload.ek);
    await initializeSession(peerUsername, myPreKeyPriv, peerEphemeralPub, false);
  }

  const msgKey = await ratchetReceiveKey(peerUsername, payload.idx);
  return decryptMessage(payload.ct, msgKey);
}

async function eciesEncrypt(text: string, peerPreKeyB64: string): Promise<string> {
  const ephemeralPair = await generatePreKeyPair();
  const ephemeralPubStr = await exportPublicKey(ephemeralPair.publicKey);
  const peerPreKey = await importPrePublicKey(peerPreKeyB64);

  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerPreKey },
    ephemeralPair.privateKey,
    256,
  );

  const sharedSecret = await crypto.subtle.importKey("raw", sharedSecretBits, { name: "HKDF" }, false, ["deriveKey"]);

  const msgKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("SecureChatSelfSalt"),
      info: new TextEncoder().encode("SelfMessageKey"),
    },
    sharedSecret,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  const ct = await encryptMessage(text, msgKey);
  return JSON.stringify({ ek: ephemeralPubStr, ct });
}

async function eciesDecrypt(payloadStr: string, privateKey: CryptoKey): Promise<string> {
  let payload: { ek?: string; ct: string };
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    throw new CryptoError("Invalid payload format");
  }
  if (!payload.ek) throw new CryptoError("No ephemeral key in ciphertext");

  const ephemeralPub = await importPrePublicKey(payload.ek);
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: ephemeralPub },
    privateKey,
    256,
  );

  const sharedSecret = await crypto.subtle.importKey("raw", sharedSecretBits, { name: "HKDF" }, false, ["deriveKey"]);

  const msgKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("SecureChatSelfSalt"),
      info: new TextEncoder().encode("SelfMessageKey"),
    },
    sharedSecret,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  return decryptMessage(payload.ct, msgKey);
}

export async function encryptECIES(text: string, peerPreKeyB64: string): Promise<string> {
  return eciesEncrypt(text, peerPreKeyB64);
}

export async function encryptSelf(text: string): Promise<string> {
  const myPreKeyPubB64 = useCryptoStore.getState().preKeyPublicB64;
  if (!myPreKeyPubB64) throw new CryptoError("PreKey not ready");
  return eciesEncrypt(text, myPreKeyPubB64);
}

export async function decryptSelf(payloadStr: string): Promise<string> {
  const myPreKeyPriv = useCryptoStore.getState().preKeyPrivateKey;
  if (!myPreKeyPriv) throw new CryptoError("PreKey private not ready");
  return eciesDecrypt(payloadStr, myPreKeyPriv);
}

export const decryptECIES = decryptSelf;

// Returns a non-extractable AES-GCM key. Raw bytes never enter JS after this call.
export async function generateGroupMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// Wraps the GMK for a member via ECIES. Raw key bytes exist only for the
// duration of the exportKey + encrypt call.
export async function wrapGroupMasterKeyForMember(gmk: CryptoKey, memberPreKeyB64: string): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", gmk);
  const gmkB64 = uint8ToBase64(new Uint8Array(raw));
  return eciesEncrypt(gmkB64, memberPreKeyB64);
}

export async function unwrapGroupMasterKey(wrappedB64: string): Promise<CryptoKey> {
  const myPreKeyPriv = useCryptoStore.getState().preKeyPrivateKey;
  if (!myPreKeyPriv) throw new CryptoError("PreKey private not ready");
  const gmkB64 = await eciesDecrypt(wrappedB64, myPreKeyPriv);
  const raw = base64ToUint8(gmkB64);
  return crypto.subtle.importKey("raw", toBuffer(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptGroupMessage(text: string, gmk: CryptoKey, myIdentityPrivateKey: CryptoKey): Promise<string> {
  const textBytes = new TextEncoder().encode(text);
  const signatureBytes = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    myIdentityPrivateKey,
    textBytes,
  );

  const payloadStr = JSON.stringify({ text, sig: uint8ToBase64(new Uint8Array(signatureBytes)) });
  return encryptMessage(payloadStr, gmk);
}

export async function decryptGroupMessage(
  ciphertext: string,
  gmk: CryptoKey,
  senderIdentityPublicB64: string,
): Promise<string> {
  const decryptedStr = await decryptMessage(ciphertext, gmk);

  let payload: { text: string; sig: string };
  try {
    payload = JSON.parse(decryptedStr);
  } catch {
    throw new CryptoError("Invalid group message payload");
  }

  const senderIdentityKey = await importIdentityPublicKey(senderIdentityPublicB64);
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    senderIdentityKey,
    new Uint8Array(base64ToUint8(payload.sig)),
    new TextEncoder().encode(payload.text),
  );

  if (!valid) throw new CryptoError("Invalid group message signature");
  return payload.text;
}
