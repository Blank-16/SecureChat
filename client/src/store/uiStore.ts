import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface UiStore {
  selectedUser: string | null;
  mobileMenuOpen: boolean;
  setSelectedUser: (username: string | null) => void;
  setMobileMenuOpen: (open: boolean) => void;
}

export const useUiStore = create<UiStore>()(
  immer((set) => ({
    selectedUser: null,
    mobileMenuOpen: false,

    setSelectedUser: (username) =>
      set((s) => {
        s.selectedUser = username;
      }),

    setMobileMenuOpen: (open) =>
      set((s) => {
        s.mobileMenuOpen = open;
      }),
  })),
);
