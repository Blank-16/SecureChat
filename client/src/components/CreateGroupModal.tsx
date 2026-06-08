import { useState } from "react";
import { Modal } from "./Modal";
import { useContactsStore } from "../store/contactsStore";

interface CreateGroupModalProps {
  onCreate: (name: string, members: string[]) => void;
  onClose: () => void;
}

export function CreateGroupModal({ onCreate, onClose }: CreateGroupModalProps) {
  const [name, setName] = useState("");
  const contacts = useContactsStore((s) => s.contacts);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  function handleToggleMember(username: string) {
    setSelectedMembers((prev) =>
      prev.includes(username)
        ? prev.filter((u) => u !== username)
        : [...prev, username]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || selectedMembers.length === 0) return;
    onCreate(trimmed, selectedMembers);
    onClose();
  }

  return (
    <Modal title="CREATE_SECURE_GROUP" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5 font-mono">
        <div>
          <label htmlFor="group-name" className="block text-xs uppercase font-bold text-surface-400 mb-2 tracking-wider">
            GROUP NAME
          </label>
          <input
            id="group-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            autoFocus
            placeholder="e.g. ALPHA TEAM"
            className="w-full bg-surface-900 border-2 border-surface-600 px-4 py-3 text-sm font-semibold focus:outline-none focus:border-accent rounded-none transition-all placeholder:text-surface-600"
          />
        </div>

        <div>
          <span className="block text-xs uppercase font-bold text-surface-400 mb-2 tracking-wider">
            SELECT MEMBERS ({selectedMembers.length} SELECTED)
          </span>
          <div className="max-h-40 overflow-y-auto border-2 border-surface-600 p-2 space-y-1 bg-surface-900/40">
            {contacts.length === 0 ? (
              <div className="p-4 text-center text-xs text-surface-500 uppercase font-bold">
                No contacts available
              </div>
            ) : (
              contacts.map((c) => {
                const isSelected = selectedMembers.includes(c.username);
                return (
                  <button
                    key={c.username}
                    type="button"
                    onClick={() => handleToggleMember(c.username)}
                    className={`w-full flex items-center justify-between p-2 border-2 transition-all cursor-pointer rounded-none text-left mb-1 ${
                      isSelected
                        ? "bg-accent border-black text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] font-black"
                        : "bg-surface-800 border-surface-700 hover:border-surface-500 text-white"
                    }`}
                  >
                    <span className="text-xs uppercase">{c.username}</span>
                    <span className="text-[10px] uppercase font-bold">
                      {isSelected ? "[SELECTED]" : "[ADD]"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold uppercase border-2 border-surface-600 text-surface-400 hover:text-white hover:border-surface-400 transition-colors cursor-pointer rounded-none"
          >
            CANCEL
          </button>
          <button
            type="submit"
            disabled={!name.trim() || selectedMembers.length === 0}
            className="px-4 py-2.5 text-xs font-bold uppercase border-2 rounded-none cursor-pointer transition-all bg-accent border-black text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1.5px] hover:translate-y-[1.5px] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0"
          >
            CREATE
          </button>
        </div>
      </form>
    </Modal>
  );
}
