import {
  importPublicKey,
  encrypt,
  decrypt,
} from "../utils/crypto";
import { useCryptoStore } from "../store/cryptoStore";

interface UseEncryptionReturn {
  publicKeyB64: string | null;
  encryptFor: (
    plaintext: string,
    recipientPublicKeyB64: string,
  ) => Promise<string>;
  decryptOwn: (ciphertext: string) => Promise<string>;
  ready: boolean;
  initialize: (passphrase: string) => Promise<void>;
  clearKeys: () => void;
}

export function useEncryption(): UseEncryptionReturn {
  const { publicKeyB64, privateKey, ready, initialize, clear } = useCryptoStore();

  async function encryptFor(
    plaintext: string,
    recipientPublicKeyB64: string,
  ): Promise<string> {
    const recipientKey = await importPublicKey(recipientPublicKeyB64);
    return encrypt(plaintext, recipientKey);
  }

  async function decryptOwn(ciphertext: string): Promise<string> {
    if (!privateKey) throw new Error("keys not ready");
    return decrypt(ciphertext, privateKey);
  }

  return {
    publicKeyB64,
    encryptFor,
    decryptOwn,
    ready,
    initialize,
    clearKeys: clear,
  };
}
