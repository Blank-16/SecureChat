import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { User } from "../types";

interface ContactsStore {
  contacts: User[];
  blocked: User[];
  unreadCounts: Record<string, number>;
  setContacts: (contacts: User[]) => void;
  setBlocked: (blocked: User[]) => void;
  updateContactStatus: (username: string, online: boolean) => void;
  isBlocked: (username: string) => boolean;
  incrementUnread: (username: string) => void;
  clearUnread: (username: string) => void;
}

export const useContactsStore = create<ContactsStore>()(
  immer((set, get) => ({
    contacts: [],
    blocked: [],
    unreadCounts: {},

    setContacts: (contacts) => {
      set((s) => {
        s.contacts = contacts;
        const validUsernames = new Set(contacts.map(c => c.username));
        for (const username of Object.keys(s.unreadCounts)) {
          if (!validUsernames.has(username)) delete s.unreadCounts[username];
        }
      });
    },

    setBlocked: (blocked) => set((s) => { s.blocked = blocked; }),

    updateContactStatus: (username, online) => {
      set((s) => {
        const contact = s.contacts.find(c => c.username === username);
        if (contact) contact.online = online;
      });
    },

    isBlocked: (username) => get().blocked.some(u => u.username === username),

    incrementUnread: (username) => {
      set((s) => { s.unreadCounts[username] = (s.unreadCounts[username] ?? 0) + 1; });
    },

    clearUnread: (username) => {
      set((s) => { delete s.unreadCounts[username]; });
    },
  }))
);
