import {
  AES_ALGORITHM,
  AES_KEY_LENGTH,
  AES_IV_LENGTH,
  RSA_ALGORITHM,
} from "./constants";
import { CryptoError, base64ToUint8, uint8ToBase64, toBuffer } from "./helpers";

/**
 * Encrypts a plaintext string using a hybrid encryption scheme:
 * 1. Generates a fresh, ephemeral symmetric AES-GCM-256 key.
 * 2. Encrypts the plaintext with this AES key.
 * 3. Encrypts the ephemeral AES key using the recipient's public RSA-OAEP key (key wrapping).
 *
 * This hybrid approach completely circumvents the strict plaintext size limit of RSA-OAEP
 * (which is ~190 bytes for RSA-2048 with SHA-256) while retaining asymmetric public key delivery.
 */
export async function encrypt(
  plaintext: string,
  publicKey: CryptoKey,
): Promise<string> {
  const aesKey = await crypto.subtle.generateKey(
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,
    ["encrypt", "decrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const encryptedData = new Uint8Array(
    (await crypto.subtle.encrypt(
      { name: AES_ALGORITHM, iv },
      aesKey,
      encoded,
    )) as ArrayBuffer,
  );

  const rawAesKey = new Uint8Array(
    (await crypto.subtle.exportKey("raw", aesKey)) as ArrayBuffer,
  );
  const encryptedAesKey = new Uint8Array(
    (await crypto.subtle.encrypt(
      { name: RSA_ALGORITHM },
      publicKey,
      rawAesKey,
    )) as ArrayBuffer,
  );

  const lenBuf = new Uint8Array(4);
  new DataView(lenBuf.buffer).setUint32(0, encryptedAesKey.length, false);

  const combined = new Uint8Array(
    4 + encryptedAesKey.length + AES_IV_LENGTH + encryptedData.length,
  );
  let offset = 0;
  combined.set(lenBuf, offset);
  offset += 4;
  combined.set(encryptedAesKey, offset);
  offset += encryptedAesKey.length;
  combined.set(iv, offset);
  offset += AES_IV_LENGTH;
  combined.set(encryptedData, offset);

  return uint8ToBase64(combined);
}

/**
 * Decrypts a hybrid-encrypted ciphertext:
 * 1. Parses the packed structure (extracts RSA-wrapped AES key, AES IV, and ciphertext).
 * 2. Unwraps the ephemeral AES key using the recipient's private RSA-OAEP key.
 * 3. Decrypts the payload with the unwrapped AES-GCM key.
 */
export async function decrypt(
  ciphertext: string,
  privateKey: CryptoKey,
): Promise<string> {
  const combined = base64ToUint8(ciphertext);

  if (combined.length < 4) {
    throw new CryptoError("Malformed ciphertext: too short");
  }

  const encKeyLen = new DataView(
    combined.buffer,
    combined.byteOffset,
    4,
  ).getUint32(0, false);

  if (combined.length < 4 + encKeyLen + AES_IV_LENGTH) {
    throw new CryptoError("Malformed ciphertext: truncated payload");
  }

  let offset = 4;
  const encryptedAesKey = combined.slice(offset, offset + encKeyLen);
  offset += encKeyLen;
  const iv = combined.slice(offset, offset + AES_IV_LENGTH);
  offset += AES_IV_LENGTH;
  const encryptedData = combined.slice(offset);

  let rawAesKey: ArrayBuffer;
  try {
    rawAesKey = (await crypto.subtle.decrypt(
      { name: RSA_ALGORITHM },
      privateKey,
      encryptedAesKey,
    )) as ArrayBuffer;
  } catch (err) {
    throw new CryptoError(
      "Failed to unwrap session key — wrong private key or tampered data",
      { cause: err },
    );
  }

  const aesKey = await crypto.subtle.importKey(
    "raw",
    rawAesKey,
    { name: AES_ALGORITHM },
    false,
    ["decrypt"],
  );

  try {
    const decoded = (await crypto.subtle.decrypt(
      { name: AES_ALGORITHM, iv },
      aesKey,
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

/**
 * Decrypts a simple RSA-OAEP ciphertext.
 * Used for decrypting challenge nonces during authentication.
 */
export async function decryptRSA(
  ciphertextB64: string,
  privateKey: CryptoKey,
): Promise<string> {
  try {
    const ciphertextBuf = base64ToUint8(ciphertextB64);
    const decryptedBuf = await crypto.subtle.decrypt(
      { name: RSA_ALGORITHM },
      privateKey,
      toBuffer(ciphertextBuf)
    );
    return new TextDecoder().decode(decryptedBuf);
  } catch (err) {
    throw new CryptoError("RSA Decryption failed", { cause: err });
  }
}
