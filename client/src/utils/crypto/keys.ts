import {
  ECDSA_ALGORITHM,
  ECDSA_CURVE,
  ECDH_ALGORITHM,
} from "./constants";
import { CryptoError, base64ToUint8, uint8ToBase64, toBuffer } from "./helpers";

export async function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: ECDSA_ALGORITHM, namedCurve: ECDSA_CURVE },
    true,
    ["sign", "verify"]
  );
}

export async function generatePreKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: ECDH_ALGORITHM, namedCurve: ECDSA_CURVE },
    true,
    ["deriveKey", "deriveBits"]
  );
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const buf = (await crypto.subtle.exportKey("spki", key)) as ArrayBuffer;
  return uint8ToBase64(new Uint8Array(buf));
}

export async function importIdentityPublicKey(b64: string): Promise<CryptoKey> {
  try {
    const uint8 = base64ToUint8(b64);
    return await crypto.subtle.importKey(
      "spki",
      toBuffer(uint8),
      { name: ECDSA_ALGORITHM, namedCurve: ECDSA_CURVE },
      true,
      ["verify"]
    );
  } catch (err) {
    throw new CryptoError("Failed to import identity public key", { cause: err });
  }
}

export async function importPrePublicKey(b64: string): Promise<CryptoKey> {
  try {
    const uint8 = base64ToUint8(b64);
    return await crypto.subtle.importKey(
      "spki",
      toBuffer(uint8),
      { name: ECDH_ALGORITHM, namedCurve: ECDSA_CURVE },
      true,
      []
    );
  } catch (err) {
    throw new CryptoError("Failed to import pre public key", { cause: err });
  }
}

export async function signData(privateKey: CryptoKey, data: BufferSource): Promise<string> {
  const sig = await crypto.subtle.sign(
    { name: ECDSA_ALGORITHM, hash: { name: "SHA-256" } },
    privateKey,
    data
  );
  return uint8ToBase64(new Uint8Array(sig));
}

export async function verifySignature(publicKey: CryptoKey, signatureB64: string, data: BufferSource): Promise<boolean> {
  const sigBytes = base64ToUint8(signatureB64);
  return crypto.subtle.verify(
    { name: ECDSA_ALGORITHM, hash: { name: "SHA-256" } },
    publicKey,
    sigBytes as BufferSource,
    data
  );
}
