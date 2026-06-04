import { useState } from "react";
import { useEncryption } from "../../hooks/useEncryption";
import { useToastStore } from "../../store/toastStore";
import { useAuthStore } from "../../store/authStore";
import { useCryptoStore } from "../../store/cryptoStore";
import { API_URL } from "../../lib/constants";

interface LoginFormProps {
  onLoading: (isLoading: boolean) => void;
  loading: boolean;
}

export function LoginForm({ onLoading, loading }: LoginFormProps) {
  const { initialize, decryptChallenge } = useEncryption();
  const { addToast } = useToastStore();
  const [username, setUsername] = useState("");
  const [passphrase, setPassphrase] = useState("");

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
    try {
      addToast("Unlocking local keys...", "info");
      await initialize(passphrase);

      addToast("Requesting cryptographic challenge...", "info");
      const challengeRes = await fetch(`${API_URL}/auth/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername }),
      });

      if (!challengeRes.ok) {
        const errData = await challengeRes.json().catch(() => ({ error: "Failed to get challenge" }));
        throw new Error(errData.error || "Failed to initiate login");
      }

      const { encryptedNonce } = await challengeRes.json();

      addToast("Solving challenge...", "info");
      // This proves we own the private key by decrypting the nonce
      const decryptedNonce = await decryptChallenge(encryptedNonce);

      addToast("Submitting proof...", "info");
      const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername, decryptedNonce }),
        credentials: "include",
      });

      if (!loginRes.ok) {
        const errData = await loginRes.json().catch(() => ({ error: "Login failed" }));
        throw new Error(errData.error || "Authentication failed");
      }

      const userData = await loginRes.json();
      addToast(`Authenticated successfully as ${userData.username}`, "success");
      
      useAuthStore.getState().setAuthenticated(userData.username, userData.displayName);
    } catch (err: unknown) {
      console.error(err);
      useCryptoStore.getState().clear();
      const msg = err instanceof Error ? err.message : "Authentication failed";
      addToast(msg, "error");
    } finally {
      onLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-xs uppercase font-bold text-surface-400 mb-2 tracking-wider">
          [01] USERNAME
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
          placeholder="e.g. alice_12"
          className="w-full bg-surface-900 border-2 border-surface-600 px-4 py-3 text-sm font-semibold focus:outline-none focus:border-accent rounded-none transition-all placeholder:text-surface-600"
        />
      </div>

      <div>
        <label className="block text-xs uppercase font-bold text-surface-400 mb-2 tracking-wider">
          [02] LOCAL_PASSPHRASE
        </label>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          disabled={loading}
          placeholder="••••••••••••"
          className="w-full bg-surface-900 border-2 border-surface-600 px-4 py-3 text-sm font-semibold focus:outline-none focus:border-accent rounded-none transition-all placeholder:text-surface-600"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className={`w-full py-3.5 border-2 font-bold uppercase text-sm tracking-widest cursor-pointer select-none rounded-none transition-all
          ${
            loading
              ? "bg-surface-700 border-surface-600 text-surface-500 cursor-not-allowed"
              : "bg-accent border-black text-black shadow-[4px_4px_0px_0px_rgba(124,106,245,0.2)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px]"
          }
        `}
      >
        {loading ? "AUTHENTICATING..." : "DECRYPT_&_LOGIN"}
      </button>
    </form>
  );
}
