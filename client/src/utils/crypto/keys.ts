import {
  RSA_ALGORITHM,
  RSA_HASH,
  KEY_USAGES_KEYPAIR,
  KEY_USAGES_PUBLIC,
} from "./constants";
import { CryptoError, base64ToUint8, uint8ToBase64, toBuffer } from "./helpers";

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: RSA_ALGORITHM,
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: RSA_HASH,
    },
    true,
    KEY_USAGES_KEYPAIR,
  );
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const buf = (await crypto.subtle.exportKey("spki", key)) as ArrayBuffer;
  return uint8ToBase64(new Uint8Array(buf));
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
  try {
    const uint8 = base64ToUint8(b64);
    return await crypto.subtle.importKey(
      "spki",
      toBuffer(uint8),
      { name: RSA_ALGORITHM, hash: RSA_HASH },
      true,
      KEY_USAGES_PUBLIC,
    );
  } catch (err) {
    throw new CryptoError("Failed to import public key", { cause: err });
  }
}
