export class CryptoError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CryptoError";
  }
}

// Extracts a guaranteed plain ArrayBuffer from any Uint8Array.
// Needed because TS 5.x types Uint8Array as Uint8Array<ArrayBufferLike>, but
// Web Crypto's BufferSource only accepts Uint8Array<ArrayBuffer>.
export function toBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(
    u8.byteOffset,
    u8.byteOffset + u8.byteLength,
  ) as ArrayBuffer;
}

export function uint8ToBase64(uint8: Uint8Array): string {
  let binary = "";
  const len = uint8.length;
  const chunk = 8192;
  for (let i = 0; i < len; i += chunk) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  try {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch (err) {
    throw new TypeError(`Invalid base64 string: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function getFingerprint(publicKeyB64: string): Promise<string> {
  try {
    const derBuffer = base64ToUint8(publicKeyB64);
    const hashBuffer = await crypto.subtle.digest("SHA-256", toBuffer(derBuffer));
    const hashArray = new Uint8Array(hashBuffer);
    const blocks: string[] = [];
    for (let i = 0; i < 5; i++) {
      const byte1 = hashArray[i * 2];
      const byte2 = hashArray[i * 2 + 1];
      const val = (byte1 * 256 + byte2) % 100000;
      blocks.push(String(val).padStart(5, "0"));
    }
    return blocks.join(" ");
  } catch {
    return "00000 00000 00000 00000 00000";
  }
}

