import { useEffect, useState } from "react";
import { getFingerprint } from "../utils/crypto";

interface SafetyNumberModalProps {
  peer: string;
  peerKey: string;
  ownKey: string;
  onClose: () => void;
}

export function SafetyNumberModal({ peer, peerKey, ownKey, onClose }: SafetyNumberModalProps) {
  const [peerFingerprint, setPeerFingerprint] = useState<string>("loading...");
  const [ownFingerprint, setOwnFingerprint] = useState<string>("loading...");

  useEffect(() => {
    let active = true;
    async function load() {
      const [peerFp, ownFp] = await Promise.all([
        getFingerprint(peerKey),
        getFingerprint(ownKey),
      ]);
      if (active) {
        setPeerFingerprint(peerFp);
        setOwnFingerprint(ownFp);
      }
    }
    void load();
    return () => { active = false; };
  }, [peerKey, ownKey]);

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-800 border-4 border-black p-6 w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-none space-y-6 font-mono text-white animate-scale-up">
        
        {/* Header */}
        <div className="border-b-2 border-surface-650 pb-4 flex justify-between items-center bg-surface-900 -mx-6 -mt-6 p-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0110 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0114 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
            <h2 className="text-sm font-black uppercase tracking-widest text-white">VERIFY_SAFETY_NUMBERS</h2>
          </div>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-white border border-surface-650 px-2 py-0.5 text-xs font-bold bg-surface-800 hover:border-white uppercase cursor-pointer"
          >
            CLOSE
          </button>
        </div>

        {/* Content */}
        <p className="text-xs uppercase text-surface-400 leading-relaxed">
          To verify end-to-end security with <strong className="text-white">{peer}</strong>, compare these safety numbers with their device. If they match, your communication is immune to interception.
        </p>

        {/* Fingerprints */}
        <div className="space-y-4">
          <div className="border-2 border-surface-600 bg-surface-900 p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            <span className="text-[10px] uppercase font-bold text-accent">[YOUR_FINGERPRINT]</span>
            <div className="mt-1 text-md font-bold font-mono tracking-widest text-white break-words select-all">
              {ownFingerprint}
            </div>
          </div>

          <div className="border-2 border-surface-600 bg-surface-900 p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            <span className="text-[10px] uppercase font-bold text-accent">[{peer.toUpperCase()}_FINGERPRINT]</span>
            <div className="mt-1 text-md font-bold font-mono tracking-widest text-white break-words select-all">
              {peerFingerprint}
            </div>
          </div>
        </div>

        {/* Footer Notes */}
        <div className="bg-surface-900 border border-surface-700/60 p-3 text-[10px] text-surface-500 uppercase font-bold space-y-1 select-none">
          <div>- Method: SHA-256 Public Key Hashing</div>
          <div>- Key Encoding: SPKI DER (Base64 Representation)</div>
          <div>- Purpose: Prevents Server-Side Man-in-the-Middle Attacks</div>
        </div>

        {/* Button */}
        <button
          onClick={onClose}
          className="w-full bg-accent hover:bg-[#6c5be8] border-2 border-black text-black font-black uppercase py-2.5 text-xs tracking-wider shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] cursor-pointer transition-all rounded-none"
        >
          I_HAVE_VERIFIED
        </button>
      </div>
    </div>
  );
}
