import { ReactNode, useState } from "react";

interface AuthLayoutProps {
  children: ReactNode;
  isRegistering: boolean;
  onToggleMode: () => void;
  loading: boolean;
}

export function AuthLayout({ children, isRegistering, onToggleMode, loading }: AuthLayoutProps) {
  const [showExplainer, setShowExplainer] = useState(true);

  return (
    <div className="flex min-h-screen bg-surface-900 font-mono text-white selection:bg-accent selection:text-white">
      <div className="flex flex-col lg:flex-row w-full max-w-7xl mx-auto p-4 lg:p-8 items-center justify-center gap-8">
        
        {/* Left Side: Auth Card */}
        <div className="w-full max-w-md bg-surface-800 border-2 border-surface-600 p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-none">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-accent text-black p-2 border-2 border-black font-bold text-lg select-none">
              SEC
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white leading-none">SECURE_CHAT</h1>
              <p className="text-xs text-accent uppercase font-bold mt-1 tracking-wider">Zero-Knowledge E2EE</p>
            </div>
          </div>

          {children}

          <div className="mt-8 pt-6 border-t-2 border-surface-700 flex justify-between items-center text-xs">
            <button
              type="button"
              onClick={onToggleMode}
              disabled={loading}
              className="text-accent font-bold hover:underline uppercase tracking-wider disabled:no-underline disabled:opacity-50"
            >
              {isRegistering ? "-> Switch to Sign In" : "-> Need an account?"}
            </button>

            <button
              type="button"
              onClick={() => setShowExplainer(!showExplainer)}
              className="text-surface-500 hover:text-white uppercase tracking-wider font-bold"
            >
              {showExplainer ? "[Hide Help]" : "[Show Help]"}
            </button>
          </div>
        </div>

        {/* Right Side: Security Explainer */}
        {showExplainer && (
          <div className="w-full max-w-lg bg-surface-800 border-2 border-surface-600 p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-none space-y-6">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <h2 className="text-md font-bold uppercase tracking-wider">ZERO_KNOWLEDGE_PROTOCOL</h2>
            </div>

            <p className="text-xs text-surface-400 leading-relaxed">
              SecureChat implements end-to-end asymmetric cryptography. Your identity is verified cryptographically by the server, but your encryption keys never leave this device.
            </p>

            <div className="space-y-4 border-l-2 border-accent pl-4 text-xs">
              <div>
                <h3 className="font-bold uppercase tracking-wider text-accent">[01] Key Generation</h3>
                <p className="text-surface-400 mt-1">
                  On registration, a secure RSA-OAEP 2048-bit keypair is generated directly inside your browser sandbox.
                </p>
              </div>

              <div>
                <h3 className="font-bold uppercase tracking-wider text-accent">[02] Local Passphrase Wrapping</h3>
                <p className="text-surface-400 mt-1">
                  Your passphrase derives an AES-256 wrapping key via PBKDF2 with 100,000 iterations. This wraps your private key before storing it in IndexedDB.
                </p>
              </div>

              <div>
                <h3 className="font-bold uppercase tracking-wider text-accent">[03] Symmetric Exchange</h3>
                <p className="text-surface-400 mt-1">
                  Messages are encrypted symmetrically using AES-GCM-256. The session keys are then securely wrapped using the recipient's RSA public key.
                </p>
              </div>
            </div>

            <div className="bg-surface-900 border-2 border-surface-700 p-4 text-[10px] text-accent font-bold tracking-wider leading-relaxed">
              WARNING: SecureChat does not store your passphrase on the server. If you lose your passphrase, your locally stored private key cannot be decrypted, and all chat history will be lost forever.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
