import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>()(
  immer((set) => ({
    toasts: [],
    addToast: (message, type = "info") => {
      const id = crypto.randomUUID();
      set((s) => {
        s.toasts.push({ id, message, type });
      });

      // Auto-remove after 3.5 seconds
      setTimeout(() => {
        set((s) => {
          s.toasts = s.toasts.filter((t) => t.id !== id);
        });
      }, 3500);
    },
    removeToast: (id) =>
      set((s) => {
        s.toasts = s.toasts.filter((t) => t.id !== id);
      }),
  })),
);
