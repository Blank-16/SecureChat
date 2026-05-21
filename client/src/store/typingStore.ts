import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface TypingStore {
  typingUsers: Record<string, boolean>;
  setTyping: (username: string, isTyping: boolean) => void;
  isTyping: (username: string) => boolean;
}

const typingTimeouts: Record<string, any> = {};
const TYPING_AUTO_EXPIRE_MS = 2500;

export const useTypingStore = create<TypingStore>()(
  immer((set, get) => ({
    typingUsers: {},

    setTyping: (username, isTyping) => {
      // Clear any existing timeout for this user
      if (typingTimeouts[username]) {
        clearTimeout(typingTimeouts[username]);
        delete typingTimeouts[username];
      }

      if (isTyping) {
        set((s) => {
          s.typingUsers[username] = true;
        });

        // Set a new timeout to auto-clear the typing status
        typingTimeouts[username] = setTimeout(() => {
          get().setTyping(username, false);
        }, TYPING_AUTO_EXPIRE_MS);
      } else {
        set((s) => {
          delete s.typingUsers[username];
        });
      }
    },

    isTyping: (username) => {
      return username in get().typingUsers;
    },
  })),
);
