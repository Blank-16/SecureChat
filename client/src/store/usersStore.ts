import { create } from "zustand";
import { User } from "../types";
import { immer } from "zustand/middleware/immer";

interface UsersStore {
  users: User[];
  unreadCounts: Record<string, number>;
  setUsers: (users: User[]) => void;
  updateUserStatus: (userId: number, username: string, online: boolean) => void;
  incrementUnread: (username: string) => void;
  clearUnread: (username: string) => void;
}

export const useUsersStore = create<UsersStore>()(
  immer((set) => ({
    users: [],
    unreadCounts: {},

    setUsers: (users) =>
      set((s) => {
        s.users = users;
      }),

    updateUserStatus: (userId, username, online) =>
      set((s) => {
        const user = s.users.find(
          (u) => u.id === userId || u.username === username,
        );
        if (user) user.online = online;
      }),

    incrementUnread: (username) =>
      set((s) => {
        const current = s.unreadCounts[username] ?? 0;
        s.unreadCounts[username] = current + 1;
      }),
    clearUnread: (username) =>
      set((s) => {
        delete s.unreadCounts[username];
      }),
  })),
);
