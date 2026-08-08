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

/**
 * Encrypts a message using the double-ratchet protocol.
 *
 * On first contact, a session is initialized with a freshly generated
 * ephemeral key pair. The ephemeral public key and a random per-session
 * HKDF salt are both transmitted in the payload so the receiver can
 * derive the identical chain keys. The salt is not secret (RFC 5869 §3.1)
 * and transmitting it in plaintext does not weaken forward secrecy.
 */
export async function encryptRatchet(
  peerUsername: string,
  text: string,
  peerIdentityB64: string,
  peerPreKeyB64: string,
  peerPreKeySig: string,
): Promise<string> {
  let ephemeralPubStr = "";
  let sessionSaltB64 = "";

  if (!(await hasSession(peerUsername))) {
    const peerIdentityKey = await importIdentityPublicKey(peerIdentityB64);
    const valid = await verifySignature(peerIdentityKey, peerPreKeySig, new TextEncoder().encode(peerPreKeyB64));
    if (!valid) throw new CryptoError("Invalid peer PreKey signature");

    const ephemeralPair = await generatePreKeyPair();
    ephemeralPubStr = await exportPublicKey(ephemeralPair.publicKey);

    // Generate the session salt here (initiator side) so we can embed it in
    // the payload. The responder reads it back and passes it to initializeSession,
    // ensuring both sides derive the same root key.
    const sessionSalt = crypto.getRandomValues(new Uint8Array(32));
    sessionSaltB64 = uint8ToBase64(sessionSalt);

    const peerPreKey = await importPrePublicKey(peerPreKeyB64);
    await initializeSession(peerUsername, ephemeralPair.privateKey, peerPreKey, true, sessionSalt);
  }

  const { messageKey, msgIndex } = await ratchetSendKey(peerUsername);
  const rawCiphertext = await encryptMessage(text, messageKey);

  // `ek` and `salt` are only present on the first message of a session.
  // `idx` is always present to support out-of-order delivery.
  return JSON.stringify({
    ek: ephemeralPubStr || undefined,
    salt: sessionSaltB64 || undefined,
    ct: rawCiphertext,
    idx: msgIndex,
  });
}

/**
 * Decrypts a double-ratchet message.
 *
 * On the first message of a session (`ek` and `salt` present in payload),
 * the receiver derives the shared secret using their static PreKey and the
 * sender's ephemeral public key, then seeds the ratchet with the provided
 * salt to produce identical chain keys.
 */
export async function decryptRatchet(peerUsername: string, payloadStr: string): Promise<string> {
  let payload: { ek?: string; salt?: string; ct: string; idx: number };
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
    if (!payload.salt) throw new CryptoError("Session uninitialized and no session salt provided");

    const myPreKeyPriv = useCryptoStore.getState().preKeyPrivateKey;
    if (!myPreKeyPriv) throw new CryptoError("Local PreKey not ready");

    const sessionSalt = base64ToUint8(payload.salt);
    const peerEphemeralPub = await importPrePublicKey(payload.ek);
    await initializeSession(peerUsername, myPreKeyPriv, peerEphemeralPub, false, sessionSalt);
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

/**
 * Generates the Group Master Key (GMK) as an extractable AES-256-GCM key.
 *
 * The GMK must be extractable so its raw bytes can be ECIES-wrapped and
 * distributed to each group member individually. The raw bytes are held in
 * memory only for the duration of the wrapping calls and are never persisted
 * directly. Once each member unwraps their copy, it is re-imported as
 * non-extractable (see `unwrapGroupMasterKey`), keeping the live key opaque
 * to XSS code at rest.
 */
export async function generateGroupMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

/**
 * ECIES-wraps the GMK for a single group member.
 *
 * Exports the raw GMK bytes transiently, encrypts them with the member's
 * ECDH PreKey, then discards the plaintext. The wrapped blob is the only
 * form stored on the server.
 */
export async function wrapGroupMasterKeyForMember(gmk: CryptoKey, memberPreKeyB64: string): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", gmk);
  const gmkB64 = uint8ToBase64(new Uint8Array(raw));
  return eciesEncrypt(gmkB64, memberPreKeyB64);
}

/**
 * Unwraps and re-imports a member's ECIES-wrapped GMK as a non-extractable
 * CryptoKey. After this call the raw key material is gone from JS scope.
 */
export async function unwrapGroupMasterKey(wrappedB64: string): Promise<CryptoKey> {
  const myPreKeyPriv = useCryptoStore.getState().preKeyPrivateKey;
  if (!myPreKeyPriv) throw new CryptoError("PreKey private not ready");
  const gmkB64 = await eciesDecrypt(wrappedB64, myPreKeyPriv);
  const raw = base64ToUint8(gmkB64);
  // Re-import as non-extractable so the live in-memory key cannot be exported
  // by XSS code reaching into the Web Crypto keystore.
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
