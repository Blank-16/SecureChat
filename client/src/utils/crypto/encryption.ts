import { AES_ALGORITHM, AES_IV_LENGTH } from "./constants";
import { CryptoError, base64ToUint8, uint8ToBase64 } from "./helpers";
import { hasSession, initializeSession, ratchetSendKey, ratchetReceiveKey } from "./ratchet";
import { generatePreKeyPair, exportPublicKey, importPrePublicKey, importIdentityPublicKey, verifySignature } from "./keys";
import { useCryptoStore } from "../../store/cryptoStore";

export async function encryptMessage(
  plaintext: string,
  messageKey: CryptoKey,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const encryptedData = new Uint8Array(
    (await crypto.subtle.encrypt(
      { name: AES_ALGORITHM, iv },
      messageKey,
      encoded,
    )) as ArrayBuffer,
  );

  const combined = new Uint8Array(AES_IV_LENGTH + encryptedData.length);
  combined.set(iv, 0);
  combined.set(encryptedData, AES_IV_LENGTH);

  return uint8ToBase64(combined);
}

export async function decryptMessage(
  ciphertext: string,
  messageKey: CryptoKey,
): Promise<string> {
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
    throw new CryptoError(
      "Decryption failed — ciphertext may be tampered or corrupted",
      { cause: err },
    );
  }
}

export async function encryptRatchet(peerUsername: string, text: string, peerIdentityB64: string, peerPreKeyB64: string, peerPreKeySig: string): Promise<string> {
  let ephemeralPubStr = "";
  if (!(await hasSession(peerUsername))) {
    // 1. Verify peer's prekey signature
    const peerIdentityKey = await importIdentityPublicKey(peerIdentityB64);
    const valid = await verifySignature(peerIdentityKey, peerPreKeySig, new TextEncoder().encode(peerPreKeyB64));
    if (!valid) throw new CryptoError("Invalid peer PreKey signature");

    // 2. Generate Ephemeral Key
    const ephemeralPair = await generatePreKeyPair();
    ephemeralPubStr = await exportPublicKey(ephemeralPair.publicKey);

    // 3. Initialize Session
    const peerPreKey = await importPrePublicKey(peerPreKeyB64);
    await initializeSession(peerUsername, ephemeralPair.privateKey, peerPreKey, true);
  }

  const msgKey = await ratchetSendKey(peerUsername);
  const rawCiphertext = await encryptMessage(text, msgKey);

  // We serialize as JSON to include the ephemeral key if we just generated one.
  return JSON.stringify({
    ek: ephemeralPubStr || undefined,
    ct: rawCiphertext,
  });
}

export async function decryptRatchet(peerUsername: string, payloadStr: string): Promise<string> {
  let payload: { ek?: string, ct: string };
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    throw new CryptoError("Invalid payload format");
  }

  if (!(await hasSession(peerUsername))) {
    if (!payload.ek) throw new CryptoError("Session uninitialized and no ephemeral key provided");

    const myPreKeyPriv = useCryptoStore.getState().preKeyPrivateKey;
    if (!myPreKeyPriv) throw new CryptoError("Local PreKey not ready");

    const peerEphemeralPub = await importPrePublicKey(payload.ek);
    await initializeSession(peerUsername, myPreKeyPriv, peerEphemeralPub, false);
  }

  const msgKey = await ratchetReceiveKey(peerUsername);
  return await decryptMessage(payload.ct, msgKey);
}

export async function encryptECIES(text: string, peerPreKeyB64: string): Promise<string> {
  const ephemeralPair = await generatePreKeyPair();
  const ephemeralPubStr = await exportPublicKey(ephemeralPair.publicKey);
  const peerPreKey = await importPrePublicKey(peerPreKeyB64);

  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerPreKey },
    ephemeralPair.privateKey,
    256
  );
  
  const sharedSecret = await crypto.subtle.importKey(
    "raw",
    sharedSecretBits,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  const saltBuf = new TextEncoder().encode("SecureChatSelfSalt");
  const infoBuf = new TextEncoder().encode("SelfMessageKey");
  
  const msgKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: saltBuf,
      info: infoBuf,
    },
    sharedSecret,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const ct = await encryptMessage(text, msgKey);
  return JSON.stringify({ ek: ephemeralPubStr, ct });
}

export async function encryptSelf(text: string): Promise<string> {
  const myPreKeyPubB64 = useCryptoStore.getState().preKeyPublicB64;
  if (!myPreKeyPubB64) throw new CryptoError("PreKey not ready");
  return encryptECIES(text, myPreKeyPubB64);
}

export async function decryptSelf(payloadStr: string): Promise<string> {
  let payload: { ek?: string, ct: string };
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    throw new CryptoError("Invalid payload format");
  }
  if (!payload.ek) throw new CryptoError("No ephemeral key in self ciphertext");

  const myPreKeyPriv = useCryptoStore.getState().preKeyPrivateKey;
  if (!myPreKeyPriv) throw new CryptoError("PreKey private not ready");

  const ephemeralPub = await importPrePublicKey(payload.ek);
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: ephemeralPub },
    myPreKeyPriv,
    256
  );
  
  const sharedSecret = await crypto.subtle.importKey(
    "raw",
    sharedSecretBits,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  const saltBuf = new TextEncoder().encode("SecureChatSelfSalt");
  const infoBuf = new TextEncoder().encode("SelfMessageKey");
  
  const msgKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: saltBuf,
      info: infoBuf,
    },
    sharedSecret,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  return await decryptMessage(payload.ct, msgKey);
}


export const decryptECIES = decryptSelf;

export async function generateGroupMasterKey(): Promise<string> {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  return uint8ToBase64(rawKey);
}

export async function encryptGroupMessage(text: string, gmkB64: string, myIdentityPrivateKey: CryptoKey): Promise<string> {
  const gmkRaw = new Uint8Array(base64ToUint8(gmkB64));
  const gmk = await crypto.subtle.importKey(
    "raw",
    gmkRaw,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );

  const textBytes = new TextEncoder().encode(text);
  
  // Sign the plaintext
  const signatureBytes = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    myIdentityPrivateKey,
    textBytes
  );
  
  const payloadStr = JSON.stringify({
    text,
    sig: uint8ToBase64(new Uint8Array(signatureBytes))
  });

  return await encryptMessage(payloadStr, gmk);
}

export async function decryptGroupMessage(ciphertext: string, gmkB64: string, senderIdentityPublicB64: string): Promise<string> {
  const gmkRaw = new Uint8Array(base64ToUint8(gmkB64));
  const gmk = await crypto.subtle.importKey(
    "raw",
    gmkRaw,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );

  const decryptedStr = await decryptMessage(ciphertext, gmk);
  
  let payload: { text: string, sig: string };
  try {
    payload = JSON.parse(decryptedStr);
  } catch {
    throw new CryptoError("Invalid group message payload");
  }

  const senderIdentityKey = await importIdentityPublicKey(senderIdentityPublicB64);
  const sigBytes = new Uint8Array(base64ToUint8(payload.sig));
  const textBytes = new TextEncoder().encode(payload.text);

  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    senderIdentityKey,
    sigBytes,
    textBytes
  );

  if (!valid) throw new CryptoError("Invalid group message signature");

  return payload.text;
}
