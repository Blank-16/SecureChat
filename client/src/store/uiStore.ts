import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface UiStore {
  selectedUser: string | null;
  selectedGroup: number | null;
  mobileMenuOpen: boolean;
  setSelectedUser: (username: string | null) => void;
  setSelectedGroup: (groupId: number | null) => void;
  setMobileMenuOpen: (open: boolean) => void;
}

export const useUiStore = create<UiStore>()(
  immer((set) => ({
    selectedUser: null,
    selectedGroup: null,
    mobileMenuOpen: false,

    setSelectedUser: (username) =>
      set((s) => {
        s.selectedUser = username;
        s.selectedGroup = null;
      }),

    setSelectedGroup: (groupId) =>
      set((s) => {
        s.selectedGroup = groupId;
        s.selectedUser = null;
      }),

    setMobileMenuOpen: (open) =>
      set((s) => {
        s.mobileMenuOpen = open;
      }),
  })),
);
