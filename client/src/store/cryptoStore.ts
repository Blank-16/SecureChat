import { create } from "zustand";
import { generateIdentityKeyPair, generatePreKeyPair, exportPublicKey, persistKeyPairs, loadPersistedKeyPairs, hasPersistedKeys } from "../utils/crypto";

export class NoLocalKeysError extends Error {
  constructor() {
    super("No keys found on this device");
    this.name = "NoLocalKeysError";
  }
}

interface CryptoState {
  identityPublicKeyB64: string | null;
  identityPrivateKey: CryptoKey | null;
  preKeyPublicB64: string | null;
  preKeyPrivateKey: CryptoKey | null;
  preKeySignature: string | null;
  ready: boolean;
  initializing: boolean;
  // Generates a fresh keypair and persists it under the given passphrase.
  initialize: (passphrase: string) => Promise<void>;
  // Loads an existing keypair from storage. Throws NoLocalKeysError if none exists.
  unlock: (passphrase: string) => Promise<void>;
  clear: () => void;
}

function applyLoadedKeys(
  set: (partial: Partial<CryptoState>) => void,
  identityPubB64: string,
  preKeyPubB64: string,
  data: { identityKeyPair: CryptoKeyPair; preKeyPair: CryptoKeyPair; preKeySignature: string },
): void {
  set({
    identityPrivateKey: data.identityKeyPair.privateKey,
    identityPublicKeyB64: identityPubB64,
    preKeyPrivateKey: data.preKeyPair.privateKey,
    preKeyPublicB64: preKeyPubB64,
    preKeySignature: data.preKeySignature,
    ready: true,
    initializing: false,
  });
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
      const idPair = await generateIdentityKeyPair();
      const prePair = await generatePreKeyPair();
      await persistKeyPairs(idPair, prePair, passphrase);
      const data = await loadPersistedKeyPairs(passphrase);
      if (!data) throw new Error("Failed to load key pairs after generation");

      const identityPubB64 = await exportPublicKey(data.identityKeyPair.publicKey);
      const preKeyPubB64 = await exportPublicKey(data.preKeyPair.publicKey);
      applyLoadedKeys(set, identityPubB64, preKeyPubB64, data);
    } catch (err) {
      set({ initializing: false });
      throw err;
    }
  },

  unlock: async (passphrase: string) => {
    if (get().initializing) return;
    set({ initializing: true });
    try {
      if (!(await hasPersistedKeys())) throw new NoLocalKeysError();

      const data = await loadPersistedKeyPairs(passphrase);
      if (!data) throw new NoLocalKeysError();

      const identityPubB64 = await exportPublicKey(data.identityKeyPair.publicKey);
      const preKeyPubB64 = await exportPublicKey(data.preKeyPair.publicKey);
      applyLoadedKeys(set, identityPubB64, preKeyPubB64, data);
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
      initializing: false,
    });
  },
}));
