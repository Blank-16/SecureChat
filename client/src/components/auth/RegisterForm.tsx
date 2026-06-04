import { useState } from "react";
import { useEncryption } from "../../hooks/useEncryption";
import { useToastStore } from "../../store/toastStore";
import { useAuthStore } from "../../store/authStore";
import { useCryptoStore } from "../../store/cryptoStore";
import { API_URL } from "../../lib/constants";

interface RegisterFormProps {
  onLoading: (isLoading: boolean) => void;
  loading: boolean;
}

export function RegisterForm({ onLoading, loading }: RegisterFormProps) {
  const { initialize } = useEncryption();
  const { addToast } = useToastStore();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [passphrase, setPassphrase] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanUsername = username.trim();
    const cleanDisplayName = displayName.trim();
    if (!cleanUsername || !cleanDisplayName) {
      addToast("Username and Display Name are required", "error");
      return;
    }
    if (!/^[a-zA-Z0-9_-]{2,24}$/.test(cleanUsername)) {
      addToast("Username must be 2-24 alphanumeric characters", "error");
      return;
    }
    if (passphrase.length < 6) {
      addToast("Passphrase must be at least 6 characters", "error");
      return;
    }

    onLoading(true);
    try {
      addToast("Generating new keypair...", "info");
      await initialize(passphrase);

      const pubKeyB64 = useCryptoStore.getState().publicKeyB64;
      if (!pubKeyB64) {
        throw new Error("Failed to export public key");
      }

      addToast("Registering with server...", "info");
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername, displayName: cleanDisplayName, publicKey: pubKeyB64 }),
        credentials: "include",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Network error" }));
        throw new Error(errData.error || "Registration failed");
      }

      const userData = await res.json();
      addToast(`Account created successfully as ${userData.username}`, "success");
      
      useAuthStore.getState().setAuthenticated(userData.username, userData.displayName);
    } catch (err: unknown) {
      console.error(err);
      useCryptoStore.getState().clear();
      const msg = err instanceof Error ? err.message : "Registration failed";
      addToast(msg, "error");
    } finally {
      onLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-xs uppercase font-bold text-surface-400 mb-2 tracking-wider">
          [01] CHOOSE USERNAME
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
          [02] DISPLAY NAME
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={loading}
          placeholder="e.g. Alice"
          className="w-full bg-surface-900 border-2 border-surface-600 px-4 py-3 text-sm font-semibold focus:outline-none focus:border-accent rounded-none transition-all placeholder:text-surface-600"
        />
      </div>

      <div>
        <label className="block text-xs uppercase font-bold text-surface-400 mb-2 tracking-wider">
          [03] LOCAL_PASSPHRASE
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
        {loading ? "GENERATING_KEYS..." : "CREATE_SECURE_ACCOUNT"}
      </button>
    </form>
  );
}
