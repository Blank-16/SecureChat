import { useState } from "react";
import { Modal } from "./Modal";

interface AddContactModalProps {
  onAdd: (username: string) => void;
  onClose: () => void;
}

export function AddContactModal({ onAdd, onClose }: AddContactModalProps) {
  const [username, setUsername] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    onClose();
  }

  return (
    <Modal title="ADD_CONTACT" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="add-contact-username" className="block text-xs uppercase font-bold text-surface-400 mb-2 tracking-wider">
            EXACT USERNAME
          </label>
          <input
            id="add-contact-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            autoFocus
            placeholder="e.g. alice_12"
            className="w-full bg-surface-900 border-2 border-surface-600 px-4 py-3 text-sm font-semibold focus:outline-none focus:border-accent rounded-none transition-all placeholder:text-surface-600"
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold uppercase border-2 border-surface-600 text-surface-400 hover:text-white hover:border-surface-400 transition-colors cursor-pointer rounded-none"
          >
            CANCEL
          </button>
          <button
            type="submit"
            disabled={!username.trim()}
            className="px-4 py-2 text-xs font-bold uppercase border-2 rounded-none cursor-pointer transition-all bg-accent border-black text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1.5px] hover:translate-y-[1.5px] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0"
          >
            ADD
          </button>
        </div>
      </form>
    </Modal>
  );
}
