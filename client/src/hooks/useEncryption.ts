import {
  signData,
  encryptRatchet,
  decryptRatchet,
  encryptECIES,
  decryptECIES,
  generateGroupMasterKey,
  encryptGroupMessage,
  decryptGroupMessage
} from "../utils/crypto";
import { useCryptoStore } from "../store/cryptoStore";

interface UseEncryptionReturn {
  identityPublicKeyB64: string | null;
  preKeyPublicB64: string | null;
  preKeySignature: string | null;
  signChallenge: (nonceStr: string) => Promise<string>;
  encryptRatchet: typeof encryptRatchet;
  decryptRatchet: typeof decryptRatchet;
  encryptECIES: typeof encryptECIES;
  decryptECIES: typeof decryptECIES;
  generateGroupMasterKey: typeof generateGroupMasterKey;
  encryptGroupMessage: (text: string, gmk: string) => Promise<string>;
  decryptGroupMessage: typeof decryptGroupMessage;
  ready: boolean;
  initialize: (passphrase: string) => Promise<void>;
  clearKeys: () => void;
}

export function useEncryption(): UseEncryptionReturn {
  const { identityPublicKeyB64, preKeyPublicB64, preKeySignature, identityPrivateKey, ready, initialize, clear } = useCryptoStore();

  async function signChallenge(nonceStr: string): Promise<string> {
    if (!identityPrivateKey) throw new Error("keys not ready");
    return signData(identityPrivateKey, new TextEncoder().encode(nonceStr));
  }

  
  const encryptGroupMessageWrapper = async (text: string, gmk: string) => {
    if (!identityPrivateKey) throw new Error("Identity key not ready");
    return await encryptGroupMessage(text, gmk, identityPrivateKey);
  };

  return {
    identityPublicKeyB64,
    preKeyPublicB64,
    preKeySignature,
    signChallenge,
    encryptRatchet,
    decryptRatchet,
    encryptECIES,
    decryptECIES,
    generateGroupMasterKey,
    encryptGroupMessage: encryptGroupMessageWrapper,
    decryptGroupMessage,
    ready,
    initialize,
    clearKeys: clear,
  };
}
