export const ECDSA_ALGORITHM = "ECDSA";
export const ECDSA_CURVE = "P-256";
export const ECDH_ALGORITHM = "ECDH";

export const KEY_USAGE_PRIVATE: KeyUsage[] = ["sign"];
export const KEY_USAGES_PUBLIC: KeyUsage[] = ["verify"];

export const AES_ALGORITHM = "AES-GCM";
export const AES_KEY_LENGTH = 256;
export const AES_IV_LENGTH = 12;

export const PBKDF2_ITERATIONS = 200_000;
export const PBKDF2_HASH = "SHA-256";
export const PBKDF2_SALT_LENGTH = 16;

export const IDB_DB = "sc_keys_v2";
export const IDB_STORE = "keypair";
export const IDB_KEY = "main";

export interface PersistedKeyData {
  identityPub: ArrayBuffer;
  identityWrappedPriv: ArrayBuffer;
  preKeyPub: ArrayBuffer;
  preKeyWrappedPriv: ArrayBuffer;
  preKeySignature: string;
  salt: Uint8Array;
  ivIdentity: Uint8Array;
  ivPreKey: Uint8Array;
}
