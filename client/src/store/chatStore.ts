import { create } from "zustand";
import { Message, SendStatus } from "../types";
import { immer } from "zustand/middleware/immer";

let optimisticIdCounter = -1;
export function nextOptimisticId(): number {
  return optimisticIdCounter--;
}

interface ChatStore {
  conversations: Record<string, Message[]>;
  setHistory: (peer: string, message: Message[]) => void;
  append: (peer: string, message: Message) => void;
  confirm: (peer: string, optimisticId: number, confirmed: Message) => void;
  fail: (peer: string, optimisticId: number) => void;
  setDecrypted: (
    peer: string,
    messageId: number,
    plaintext: string,
    decryptError: boolean,
  ) => void;
  getMessages: (peer: string) => Message[];
}

export const useChatStore = create<ChatStore>()(
  immer((set, get) => ({
    conversations: {},

    setHistory: (peer, messages) => {
      set((s) => {
        s.conversations[peer] = messages;
      });
    },
    append: (peer, message) => {
      set((s) => {
        if (!s.conversations[peer]) {
          s.conversations[peer] = [];
        }
        const existing = s.conversations[peer];
        if (message.id > 0 && existing.some((m) => m.id === message.id)) return;
        existing.push(message);
      });
    },
    confirm: (peer, optimisticId, confirmed) => {
      set((s) => {
        const msgs = s.conversations[peer];
        if (!msgs) return;
        const idx = msgs.findIndex((m) => m.id === optimisticId);
        if (idx !== -1) msgs[idx] = confirmed;
      });
    },
    fail: (peer, optimisticId) => {
      set((s) => {
        const msgs = s.conversations[peer];
        if (!msgs) return;
        const msg = msgs.find((m) => m.id === optimisticId);
        if (msg) msg.sendStatus = "failed" as SendStatus;
      });
    },
    setDecrypted: (peer, messageId, plaintext, decryptError) => {
      set((s) => {
        const msgs = s.conversations[peer];
        if (!msgs) return;
        const msg = msgs.find((m) => m.id === messageId);
        if (!msg) return;
        msg.plaintext = plaintext;
        msg.decryptError = decryptError;
        msg.sendStatus = "send" as SendStatus;
      });
    },
    getMessages: (peer) => get().conversations[peer] ?? [],
  })),
);
