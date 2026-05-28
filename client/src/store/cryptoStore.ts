import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  generateKeyPair,
  exportPublicKey,
  persistKeyPair,
  loadPersistedKeyPair,
} from "../utils/crypto";

interface CryptoState {
  publicKeyB64: string | null;
  privateKey: CryptoKey | null;
  ready: boolean;
  initialize: (passphrase: string) => Promise<void>;
  clear: () => void;
}

export const useCryptoStore = create<CryptoState>()(
  immer((set) => ({
    publicKeyB64: null,
    privateKey: null,
    ready: false,

    initialize: async (passphrase: string) => {
      let pair = await loadPersistedKeyPair(passphrase);
      if (!pair) {
        pair = await generateKeyPair();
        await persistKeyPair(pair, passphrase);
      }
      const pubB64 = await exportPublicKey(pair.publicKey);
      set((s) => {
        s.privateKey = pair.privateKey;
        s.publicKeyB64 = pubB64;
        s.ready = true;
      });
    },

    clear: () => {
      set((s) => {
        s.privateKey = null;
        s.publicKeyB64 = null;
        s.ready = false;
      });
    },
  })),
);
