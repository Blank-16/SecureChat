import { useState, type FormEvent } from "react";
import { useEncryption } from "../hooks/useEncryption";
import { Spinner } from "./ui/Spinner";
import { ErrorMessage } from "./ui/ErrorMessage";
import { API_URL } from "../lib/constants";

interface Props {
  onSuccess: (username: string) => void;
}

export function UsernameSetup({ onSuccess }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { publicKeyB64 } = useEncryption();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();

    if (!trimmed) { setError("Username cannot be empty."); return; }
    if (!/^[a-zA-Z0-9_-]{2,24}$/.test(trimmed)) {
      setError("2–24 characters: letters, numbers, _ or -");
      return;
    }
    if (!publicKeyB64) { setError("Encryption keys not ready. Please wait."); return; }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: trimmed, publicKey: publicKeyB64 }),
      });

      if (res.status === 409) { setError("Username is taken. Choose another."); return; }
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setError(body.error ?? "Registration failed. Try again.");
        return;
      }

      localStorage.setItem("sc_username", trimmed);
      onSuccess(trimmed);
    } catch {
      setError("Could not reach server. Is it running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center size-12 rounded-xl bg-accent-dim border border-accent/20 mb-4">
            <svg className="size-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">SecureChat</h1>
          <p className="text-sm text-zinc-500 mt-1">End-to-end encrypted messaging</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <input
              type="text"
              placeholder="Choose a username"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(""); }}
              autoFocus
              disabled={loading}
              className="w-full bg-surface-700 border border-surface-500 rounded-lg px-4 py-3 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors disabled:opacity-50"
            />
            {error && <div className="mt-2"><ErrorMessage message={error} /></div>}
          </div>

          <button
            type="submit"
            disabled={loading || !publicKeyB64}
            className="w-full bg-accent hover:bg-accent-light active:scale-[0.98] text-white font-medium rounded-lg px-4 py-3 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? <><Spinner className="size-4 text-white" />Registering…</> : "Enter Chat"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Keys generated locally — server never sees plaintext
        </p>
      </div>
    </div>
  );
}
