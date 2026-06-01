import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { AuthState } from "../types";
import { API_URL } from "../lib/constants";

interface AuthStore {
  authState: AuthState;
  username: string;
  displayName: string;
  setChecking: () => void;
  setAuthenticated: (username: string, displayName: string) => void;
  setUnauthenticated: () => void;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  immer((set) => ({
    authState: "checking",
    username: "",
    displayName: "",

    setChecking: () => {
      set((s) => {
        s.authState = "checking";
      });
    },

    setAuthenticated: (username, displayName) => {
      set((s) => {
        s.authState = "authenticated";
        s.username = username;
        s.displayName = displayName;
      });
    },

    setUnauthenticated: () => {
      set((s) => {
        s.authState = "unauthenticated";
        s.username = "";
        s.displayName = "";
      });
    },

    logout: async () => {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
      } catch (err) {
        console.error("Logout request failed:", err);
      }
      set((s) => {
        s.authState = "unauthenticated";
        s.username = "";
        s.displayName = "";
      });
    },
    checkSession: async () => {
      try {
        const res = await fetch(`${API_URL}/auth/me`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          set((s) => {
            s.authState = "authenticated";
            s.username = data.username;
            s.displayName = data.displayName;
          });
        } else {
          set((s) => {
            s.authState = "unauthenticated";
          });
        }
      } catch (err) {
        console.error("Session check failed:", err);
        set((s) => {
          s.authState = "unauthenticated";
        });
      }
    },
  })),
);
