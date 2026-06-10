import { create } from "zustand";
import { generateIdentityKeyPair, generatePreKeyPair, exportPublicKey, persistKeyPairs, loadPersistedKeyPairs } from "../utils/crypto";

interface CryptoState {
  identityPublicKeyB64: string | null;
  identityPrivateKey: CryptoKey | null;
  preKeyPublicB64: string | null;
  preKeyPrivateKey: CryptoKey | null;
  preKeySignature: string | null;
  ready: boolean;
  initializing: boolean;
  initialize: (passphrase: string) => Promise<void>;
  clear: () => void;
}

export const useCryptoStore = create<CryptoState>()((set, get) => ({
  identityPublicKeyB64: null,
  identityPrivateKey: null,
  preKeyPublicB64: null,
  preKeyPrivateKey: null,
  preKeySignature: null,
  ready: false,
  initializing: false,

  initialize: async (passphrase: string) => {
    if (get().initializing) return;
    set({ initializing: true });
    try {
      let data = await loadPersistedKeyPairs(passphrase);
      if (!data) {
        const idPair = await generateIdentityKeyPair();
        const prePair = await generatePreKeyPair();
        await persistKeyPairs(idPair, prePair, passphrase);
        data = await loadPersistedKeyPairs(passphrase);
      }
      if (!data) throw new Error("Failed to load key pairs");
      
      const identityPubB64 = await exportPublicKey(data.identityKeyPair.publicKey);
      const preKeyPubB64 = await exportPublicKey(data.preKeyPair.publicKey);
      
      set({ 
        identityPrivateKey: data.identityKeyPair.privateKey, 
        identityPublicKeyB64: identityPubB64, 
        preKeyPrivateKey: data.preKeyPair.privateKey,
        preKeyPublicB64: preKeyPubB64,
        preKeySignature: data.preKeySignature,
        ready: true, 
        initializing: false 
      });
    } catch (err) {
      set({ initializing: false });
      throw err;
    }
  },

  clear: () => {
    set({ 
      identityPrivateKey: null, 
      identityPublicKeyB64: null, 
      preKeyPrivateKey: null,
      preKeyPublicB64: null,
      preKeySignature: null,
      ready: false, 
      initializing: false 
    });
  },
}));
