import { useState } from "react";
import { useEncryption } from "../../hooks/useEncryption";
import { useToastStore } from "../../store/toastStore";
import { useAuthStore } from "../../store/authStore";
import { useCryptoStore } from "../../store/cryptoStore";
import { API_URL } from "../../lib/constants";
import { scorePassphrase, MIN_ACCEPTABLE_SCORE } from "../../utils/passphraseStrength";

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
  const strength = scorePassphrase(passphrase);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanUsername = username.trim();
    const cleanDisplayName = displayName.trim();
    if (!cleanUsername || !cleanDisplayName) {
      addToast("Username and Display Name are required", "error");
      return;
    }
    if (!/^[a-zA-Z0-9_-]{2,24}$/.test(cleanUsername)) {
      addToast("Username: 2-24 alphanumeric characters, _ or - only", "error");
      return;
    }
    if (cleanDisplayName.length > 64) {
      addToast("Display name must be 64 characters or less", "error");
      return;
    }
    if (passphrase.length < 6) {
      addToast("Passphrase must be at least 6 characters", "error");
      return;
    }
    if (strength.score < MIN_ACCEPTABLE_SCORE) {
      addToast("Passphrase too weak — add length or mix character types", "error");
      return;
    }

    onLoading(true);
    try {
      addToast("Generating keypair...", "info");
      await initialize(passphrase);

      const identityPubB64 = useCryptoStore.getState().identityPublicKeyB64;
      const preKeyPubB64 = useCryptoStore.getState().preKeyPublicB64;
      const preKeySig = useCryptoStore.getState().preKeySignature;
      if (!identityPubB64 || !preKeyPubB64 || !preKeySig) throw new Error("Failed to export public keys");

      addToast("Registering with server...", "info");
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername, displayName: cleanDisplayName, identityKey: identityPubB64, preKey: preKeyPubB64, preKeySignature: preKeySig }),
        credentials: "include",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Network error" })) as { error?: string };
        throw new Error(errData.error ?? "Registration failed");
      }

      const userData = await res.json() as { username: string; displayName: string };
      addToast(`Account created as ${userData.username}`, "success");
      useAuthStore.getState().setAuthenticated(userData.username, userData.displayName);
    } catch (err: unknown) {
      console.error(err);
      useCryptoStore.getState().clear();
      const msg = err instanceof Error ? err.message : "Registration failed";
      addToast(msg, "error");
    } finally {
      setPassphrase("");
      onLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="reg-username" className="block text-xs uppercase font-bold text-surface-400 mb-2 tracking-wider">
          [01] CHOOSE USERNAME
        </label>
        <input
          id="reg-username"
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
        <label htmlFor="reg-displayname" className="block text-xs uppercase font-bold text-surface-400 mb-2 tracking-wider">
          [02] DISPLAY NAME
        </label>
        <input
          id="reg-displayname"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={loading}
          placeholder="e.g. Alice"
          autoComplete="name"
          className="w-full bg-surface-900 border-2 border-surface-600 px-4 py-3 text-sm font-semibold focus:outline-none focus:border-accent rounded-none transition-all placeholder:text-surface-600"
        />
      </div>

      <div>
        <label htmlFor="reg-passphrase" className="block text-xs uppercase font-bold text-surface-400 mb-2 tracking-wider">
          [03] LOCAL_PASSPHRASE
        </label>
        <input
          id="reg-passphrase"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          disabled={loading}
          placeholder="••••••••••••"
          autoComplete="new-password"
          className="w-full bg-surface-900 border-2 border-surface-600 px-4 py-3 text-sm font-semibold focus:outline-none focus:border-accent rounded-none transition-all placeholder:text-surface-600"
        />
        {passphrase.length > 0 && (
          <div className="mt-2 space-y-1">
            <div className="flex gap-1" role="meter" aria-label="Passphrase strength" aria-valuenow={strength.score} aria-valuemin={0} aria-valuemax={4}>
              {([0, 1, 2, 3] as const).map((i) => (
                <span
                  key={i}
                  className={`h-1.5 flex-1 border border-black ${
                    i < strength.score
                      ? strength.score <= 1
                        ? "bg-red-500"
                        : strength.score === 2
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      : "bg-surface-700"
                  }`}
                />
              ))}
            </div>
            <p className={`text-[10px] uppercase font-bold tracking-wider ${
              strength.score <= 1 ? "text-red-400" : strength.score === 2 ? "text-amber-400" : "text-emerald-400"
            }`}>
              {strength.label}
              {strength.score < MIN_ACCEPTABLE_SCORE && " — add length or mix character types"}
            </p>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className={`w-full py-3.5 border-2 font-bold uppercase text-sm tracking-widest cursor-pointer select-none rounded-none transition-all ${
          loading
            ? "bg-surface-700 border-surface-600 text-surface-500 cursor-not-allowed"
            : "bg-accent border-black text-black shadow-[4px_4px_0px_0px_rgba(124,106,245,0.2)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px]"
        }`}
      >
        {loading ? "GENERATING_KEYS..." : "CREATE_SECURE_ACCOUNT"}
      </button>
    </form>
  );
}
