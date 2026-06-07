import { useToastStore } from "../store/toastStore";

export function Toaster() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div role="status" aria-live="polite" aria-atomic="false" className="fixed top-6 right-6 z-50 flex flex-col gap-4 pointer-events-none w-full max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            pointer-events-auto flex items-start gap-3 p-4 rounded-none border-2
            transition-all duration-300 ease-out animate-fade-in
            bg-surface-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
            ${
              toast.type === "error"
                ? "border-red-500 text-red-200"
                : toast.type === "success"
                ? "border-emerald-500 text-emerald-200"
                : "border-accent text-white"
            }
          `}
        >
          <div className="shrink-0 mt-0.5">
            {toast.type === "error" && (
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {toast.type === "success" && (
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {toast.type === "info" && (
              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold tracking-tight">{toast.message}</p>
          </div>

          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 text-surface-500 hover:text-white transition-colors p-1 -mr-1 -mt-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
