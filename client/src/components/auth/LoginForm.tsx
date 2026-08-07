import { useState } from "react";
import { useEncryption } from "../../hooks/useEncryption";
import { useToastStore } from "../../store/toastStore";
import { useAuthStore } from "../../store/authStore";
import { useCryptoStore, NoLocalKeysError } from "../../store/cryptoStore";
import { API_URL } from "../../lib/constants";
import { CryptoError } from "../../utils/crypto";

interface LoginFormProps {
  onLoading: (isLoading: boolean) => void;
  loading: boolean;
  onSwitchToRegister?: () => void;
}

export function LoginForm({ onLoading, loading, onSwitchToRegister }: LoginFormProps) {
  const { unlock, signChallenge } = useEncryption();
  const { addToast } = useToastStore();
  const [username, setUsername] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [noKeysOnDevice, setNoKeysOnDevice] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername) {
      addToast("Username is required", "error");
      return;
    }
    if (passphrase.length < 6) {
      addToast("Passphrase must be at least 6 characters", "error");
      return;
    }

    onLoading(true);
    setNoKeysOnDevice(false);
    try {
      addToast("Requesting cryptographic challenge...", "info");
      const challengeRes = await fetch(`${API_URL}/auth/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername }),
      });

      if (!challengeRes.ok) {
        const errData = await challengeRes.json().catch(() => ({ error: "Failed to get challenge" })) as { error?: string };
        throw new Error(errData.error ?? "Failed to initiate login");
      }

      const { nonce } = await challengeRes.json() as { nonce: string };

      addToast("Unlocking local keys...", "info");
      await unlock(passphrase);

      addToast("Solving challenge...", "info");
      const signature = await signChallenge(nonce);

      addToast("Submitting proof...", "info");
      const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername, signature }),
        credentials: "include",
      });

      if (!loginRes.ok) {
        const errData = await loginRes.json().catch(() => ({ error: "Login failed" })) as { error?: string };
        throw new Error(errData.error ?? "Authentication failed");
      }

      const userData = await loginRes.json() as { username: string; displayName: string };
      addToast(`Authenticated as ${userData.username}`, "success");
      useAuthStore.getState().setAuthenticated(userData.username, userData.displayName);
    } catch (err: unknown) {
      console.error(err);
      useCryptoStore.getState().clear();

      if (err instanceof NoLocalKeysError) {
        setNoKeysOnDevice(true);
        addToast("No keys found on this device — register instead", "error");
      } else if (err instanceof CryptoError) {
        addToast("Incorrect passphrase", "error");
      } else {
        const msg = err instanceof Error ? err.message : "Authentication failed";
        addToast(msg, "error");
      }
    } finally {
      setPassphrase("");
      onLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="login-username" className="block text-xs uppercase font-bold text-surface-400 mb-2 tracking-wider">
          [01] USERNAME
        </label>
        <input
          id="login-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
          placeholder="e.g. alice_12"
          autoComplete="username"
          className="w-full bg-surface-900 border-2 border-surface-600 px-4 py-3 text-sm font-semibold focus:outline-none focus:border-accent rounded-none transition-all placeholder:text-surface-600"
        />
      </div>

      <div>
        <label htmlFor="login-passphrase" className="block text-xs uppercase font-bold text-surface-400 mb-2 tracking-wider">
          [02] LOCAL_PASSPHRASE
        </label>
        <input
          id="login-passphrase"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          disabled={loading}
          placeholder="••••••••••••"
          autoComplete="current-password"
          className="w-full bg-surface-900 border-2 border-surface-600 px-4 py-3 text-sm font-semibold focus:outline-none focus:border-accent rounded-none transition-all placeholder:text-surface-600"
        />
      </div>

      {noKeysOnDevice && (
        <div className="border-2 border-amber-500 bg-amber-950/40 p-3 text-xs text-amber-300 space-y-2">
          <p className="font-bold uppercase tracking-wider">No keys found on this device</p>
          <p className="text-amber-400/80">
            This browser has no local key material for this account. If this is a new device, register to generate fresh keys instead.
          </p>
          {onSwitchToRegister && (
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="text-amber-300 underline underline-offset-2 font-bold cursor-pointer hover:text-amber-200"
            >
              Switch to register
            </button>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className={`w-full py-3.5 border-2 font-bold uppercase text-sm tracking-widest cursor-pointer select-none rounded-none transition-all ${
          loading
            ? "bg-surface-700 border-surface-600 text-surface-500 cursor-not-allowed"
            : "bg-accent border-black text-black shadow-[4px_4px_0px_0px_rgba(124,106,245,0.2)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px]"
        }`}
      >
        {loading ? "AUTHENTICATING..." : "DECRYPT_&_LOGIN"}
      </button>
    </form>
  );
}
