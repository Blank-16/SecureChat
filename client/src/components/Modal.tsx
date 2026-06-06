import { useEffect, useRef } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="w-full max-w-md bg-surface-800 border-2 border-surface-600 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-none font-mono"
      >
        <div className="flex items-center justify-between p-4 border-b-2 border-surface-600">
          <h2 id="modal-title" className="text-sm font-bold uppercase tracking-widest text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-surface-500 hover:text-white border border-surface-600 hover:border-surface-400 w-7 h-7 flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
