import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Message } from "../types";

let optimisticIdCounter = -1;

export function nextOptimisticId(): number {
  return optimisticIdCounter--;
}

export function resetOptimisticIdCounter(): void {
  optimisticIdCounter = -1;
}

interface ChatStore {
  conversations: Record<string, Message[]>;
  setHistory: (peer: string, messages: Message[]) => void;
  append: (peer: string, message: Message) => void;
  confirm: (peer: string, optimisticId: number, confirmed: Message) => void;
  fail: (peer: string, optimisticId: number) => void;
  setDecrypted: (peer: string, messageId: number, plaintext: string, decryptError: boolean) => void;
  getMessages: (peer: string) => Message[];
  groupKeys: Record<number, Array<{ keyId: number, encryptedKey: string }>>;
  setGroupKeys: (groupId: number, keys: Array<{ keyId: number, encryptedKey: string }>) => void;
  clearAll: () => void;
}

export const useChatStore = create<ChatStore>()(
  immer((set, get) => ({
    conversations: {},

    setHistory: (peer, messages) => {
      set((s) => {
        const existing = s.conversations[peer] ?? [];
        const pending = existing.filter(m => m.id < 0 && m.sendStatus === "sending");
        s.conversations[peer] = [...messages, ...pending];
      });
    },

    append: (peer, message) => {
      set((s) => {
        if (!s.conversations[peer]) s.conversations[peer] = [];
        const existing = s.conversations[peer];
        if (message.id > 0 && existing.some(m => m.id === message.id)) return;
        existing.push(message);
      });
    },

    confirm: (peer, optimisticId, confirmed) => {
      set((s) => {
        const msgs = s.conversations[peer];
        if (!msgs) return;
        const idx = msgs.findIndex(m => m.id === optimisticId);
        if (idx !== -1) msgs[idx] = confirmed;
      });
    },

    fail: (peer, optimisticId) => {
      set((s) => {
        const msgs = s.conversations[peer];
        if (!msgs) return;
        const msg = msgs.find(m => m.id === optimisticId);
        if (msg) msg.sendStatus = "failed";
      });
    },

    setDecrypted: (peer, messageId, plaintext, decryptError) => {
      set((s) => {
        const msgs = s.conversations[peer];
        if (!msgs) return;
        const msg = msgs.find(m => m.id === messageId);
        if (!msg) return;
        msg.plaintext = plaintext;
        msg.decryptError = decryptError;
        if (msg.sendStatus !== undefined) msg.sendStatus = "send";
      });
    },

    getMessages: (peer) => get().conversations[peer] ?? [],

    groupKeys: {},

    setGroupKeys: (groupId, keys) => {
      set((s) => {
        s.groupKeys[groupId] = keys;
      });
    },

    clearAll: () => {
      set((s) => {
        s.conversations = {};
        s.groupKeys = {};
      });
      resetOptimisticIdCounter();
    },
  }))
);
