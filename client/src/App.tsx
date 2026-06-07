import { useEffect, useState } from "react";
import { useAuthStore } from "./store/authStore";
import { useCryptoStore } from "./store/cryptoStore";
import { useChatStore } from "./store/chatStore";
import { useEncryption } from "./hooks/useEncryption";
import { useToastStore } from "./store/toastStore";
import { AuthLayout } from "./components/auth/AuthLayout";
import { RegisterForm } from "./components/auth/RegisterForm";
import { LoginForm } from "./components/auth/LoginForm";
import { ChatDashboard } from "./components/ChatDashboard";
import { Toaster } from "./components/Toaster";
import { ErrorBoundary } from "./components/ErrorBoundary";

export function App() {
  const authState = useAuthStore((s) => s.authState);
  const checkSession = useAuthStore((s) => s.checkSession);
  const cryptoReady = useCryptoStore((s) => s.ready);
  const { initialize } = useEncryption();
  const { addToast } = useToastStore();

  const [unlockPassphrase, setUnlockPassphrase] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // Check user session on mount
  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (authState === "unauthenticated") {
      useChatStore.getState().clearAll();
    }
  }, [authState]);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (unlockPassphrase.length < 6) {
      addToast("Passphrase must be at least 6 characters", "error");
      return;
    }
    setUnlocking(true);
    try {
      addToast("Decrypting local keys...", "info");
      await initialize(unlockPassphrase);
      setUnlockPassphrase("");
      addToast("Local E2E workspace unlocked", "success");
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Incorrect passphrase";
      addToast(msg, "error");
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <ErrorBoundary>
      <Toaster />
      
      {/* 1. Splash Loading Screen */}
      {authState === "checking" && (
        <div className="flex h-screen w-screen items-center justify-center bg-surface-900 font-mono text-white">
          <div className="text-center space-y-6">
            <div className="relative inline-flex">
              {/* Outer Brutalist Frame */}
              <div className="w-16 h-16 border-4 border-accent animate-spin select-none" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-black text-xs text-white uppercase select-none animate-pulse">
                SEC
              </div>
            </div>
            <div className="space-y-1 select-none">
              <h2 className="text-sm font-bold tracking-widest uppercase">BOOTING_RUNTIME</h2>
              <p className="text-[10px] text-surface-500 uppercase tracking-widest animate-pulse">Checking cryptographic session...</p>
            </div>
          </div>
        </div>
      )}

      {/* 2. Unauthenticated Portal */}
      {authState === "unauthenticated" && (
        <AuthLayout
          isRegistering={isRegistering}
          onToggleMode={() => setIsRegistering(!isRegistering)}
          loading={authLoading}
        >
          {isRegistering ? (
            <RegisterForm onLoading={setAuthLoading} loading={authLoading} />
          ) : (
            <LoginForm onLoading={setAuthLoading} loading={authLoading} />
          )}
        </AuthLayout>
      )}

      {/* 3. Authenticated but Locked E2E Keys (e.g. Page Refresh) */}
      {authState === "authenticated" && !cryptoReady && (
        <div className="flex h-screen w-screen items-center justify-center bg-surface-900 font-mono text-white p-4">
          <div className="w-full max-w-md bg-surface-800 border-2 border-surface-600 p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-none">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-accent text-black p-2 border-2 border-black font-bold text-lg select-none">
                KEY
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-white leading-none">WORKSPACE_LOCKED</h1>
                <p className="text-xs text-accent uppercase font-bold mt-1 tracking-wider">E2E Session is Encrypted</p>
              </div>
            </div>

            <p className="text-xs text-surface-400 leading-relaxed mb-6 uppercase">
              Your server session is active, but your local RSA private key remains locked in IndexedDB. Enter your local passphrase to unwrap it and resume secure chatting.
            </p>

            <form onSubmit={handleUnlock} className="space-y-6">
              <div>
                <label htmlFor="unlock-passphrase" className="block text-xs uppercase font-bold text-surface-400 mb-2 tracking-wider">
                  ENTER PASSPHRASE TO UNLOCK
                </label>
                <input
                  id="unlock-passphrase"
                  type="password"
                  value={unlockPassphrase}
                  onChange={(e) => setUnlockPassphrase(e.target.value)}
                  disabled={unlocking}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  autoFocus
                  className="w-full bg-surface-900 border-2 border-surface-600 px-4 py-3 text-sm font-semibold focus:outline-none focus:border-accent rounded-none transition-all placeholder:text-surface-600"
                />
              </div>

              <button
                type="submit"
                disabled={unlocking}
                className={`w-full py-3.5 border-2 font-bold uppercase text-sm tracking-widest cursor-pointer select-none rounded-none transition-all
                  ${
                    unlocking
                      ? "bg-surface-700 border-surface-600 text-surface-500 cursor-not-allowed"
                      : "bg-accent border-black text-black shadow-[4px_4px_0px_0px_rgba(124,106,245,0.2)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px]"
                  }
                `}
              >
                {unlocking ? "UNWRAPPING_KEYS..." : "UNLOCK_WORKSPACE"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 4. Authenticated & Cryptographically Active Chat Dashboard */}
      {authState === "authenticated" && cryptoReady && <ChatDashboard />}
    </ErrorBoundary>
  );
}
