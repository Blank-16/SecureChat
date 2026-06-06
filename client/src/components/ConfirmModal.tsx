import { Modal } from "./Modal";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
}

export function ConfirmModal({ title, message, confirmLabel = "CONFIRM", onConfirm, onClose, danger = false }: ConfirmModalProps) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-xs text-surface-300 uppercase leading-relaxed mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 text-xs font-bold uppercase border-2 border-surface-600 text-surface-400 hover:text-white hover:border-surface-400 transition-colors cursor-pointer rounded-none"
        >
          CANCEL
        </button>
        <button
          onClick={() => { onConfirm(); onClose(); }}
          className={`px-4 py-2 text-xs font-bold uppercase border-2 rounded-none cursor-pointer transition-all shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1.5px] hover:translate-y-[1.5px] ${
            danger
              ? "bg-red-600 border-red-900 text-white hover:bg-red-700"
              : "bg-accent border-black text-black"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
