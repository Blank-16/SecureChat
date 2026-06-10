import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { User, Group } from "../types";

interface ContactsStore {
  contacts: User[];
  blocked: User[];
  groups: Group[];
  unreadCounts: Record<string, number>;
  setContacts: (contacts: User[]) => void;
  setBlocked: (blocked: User[]) => void;
  setGroups: (groups: Group[]) => void;
  addGroup: (group: Group) => void;
  updateGroup: (group: Group) => void;
  removeGroup: (groupId: number) => void;
  updateContactStatus: (username: string, online: boolean) => void;
  isBlocked: (username: string) => boolean;
  incrementUnread: (username: string) => void;
  clearUnread: (username: string) => void;
}

export const useContactsStore = create<ContactsStore>()(
  immer((set, get) => ({
    contacts: [],
    blocked: [],
    groups: [],
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

    setGroups: (groups) => set((s) => { s.groups = groups; }),

    addGroup: (group) => set((s) => {
      if (!s.groups.some(g => g.id === group.id)) {
        s.groups.push(group);
      }
    }),

    updateGroup: (group) => set((s) => {
      const idx = s.groups.findIndex(g => g.id === group.id);
      if (idx !== -1) {
        s.groups[idx] = group;
      }
    }),

    removeGroup: (groupId) => set((s) => {
      s.groups = s.groups.filter(g => g.id !== groupId);
    }),

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
