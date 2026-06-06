import { create } from "zustand";
import { generateKeyPair, exportPublicKey, persistKeyPair, loadPersistedKeyPair } from "../utils/crypto";

interface CryptoState {
  publicKeyB64: string | null;
  privateKey: CryptoKey | null;
  ready: boolean;
  initializing: boolean;
  initialize: (passphrase: string) => Promise<void>;
  clear: () => void;
}

export const useCryptoStore = create<CryptoState>()((set, get) => ({
  publicKeyB64: null,
  privateKey: null,
  ready: false,
  initializing: false,

  initialize: async (passphrase: string) => {
    if (get().initializing) return;
    set({ initializing: true });
    try {
      let pair = await loadPersistedKeyPair(passphrase);
      if (!pair) {
        pair = await generateKeyPair();
        await persistKeyPair(pair, passphrase);
      }
      const pubB64 = await exportPublicKey(pair.publicKey);
      set({ privateKey: pair.privateKey, publicKeyB64: pubB64, ready: true, initializing: false });
    } catch (err) {
      set({ initializing: false });
      throw err;
    }
  },

  clear: () => {
    set({ privateKey: null, publicKeyB64: null, ready: false, initializing: false });
  },
}));
