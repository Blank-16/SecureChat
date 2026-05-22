export const RSA_ALGORITHM = "RSA-OAEP";
export const RSA_HASH = "SHA-256";
export const KEY_USAGE_PRIVATE: KeyUsage[] = ["decrypt"];
export const KEY_USAGES_PUBLIC: KeyUsage[] = ["encrypt"];
export const KEY_USAGES_KEYPAIR: KeyUsage[] = [
  ...KEY_USAGES_PUBLIC,
  ...KEY_USAGE_PRIVATE,
];

export const AES_ALGORITHM = "AES-GCM";
export const AES_KEY_LENGTH = 256;
export const AES_IV_LENGTH = 12;

export const PBKDF2_ITERATIONS = 200_000;
export const PBKDF2_HASH = "SHA-256";
export const PBKDF2_SALT_LENGTH = 16;

export const IDB_DB = "sc_keys";
export const IDB_STORE = "keypair";
export const IDB_KEY = "main";

export interface PersistedKeyData {
  pub: ArrayBuffer;
  wrappedPriv: ArrayBuffer;
  salt: Uint8Array;
  iv: Uint8Array;
}
