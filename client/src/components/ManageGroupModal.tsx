import { Modal } from "./Modal";
import { useContactsStore } from "../store/contactsStore";
import type { Group } from "../types";

interface ManageGroupModalProps {
  group: Group;
  currentUsername: string;
  onAddMember: (groupId: number, username: string) => void;
  onRemoveMember: (groupId: number, username: string) => void;
  onClose: () => void;
}

export function ManageGroupModal({ group, currentUsername, onAddMember, onRemoveMember, onClose }: ManageGroupModalProps) {
  const contacts = useContactsStore((s) => s.contacts);
  
  // Available to add
  const availableToAdd = contacts.filter(c => !group.members.includes(c.username));

  return (
    <Modal title={`MANAGE GROUP: ${group.name}`} onClose={onClose}>
      <div className="space-y-6 font-mono">
        <div>
          <span className="block text-xs uppercase font-bold text-surface-400 mb-2 tracking-wider">
            CURRENT MEMBERS ({group.members.length})
          </span>
          <div className="max-h-40 overflow-y-auto border-2 border-surface-600 p-2 space-y-1 bg-surface-900/40">
            {group.members.map(m => (
              <div key={m} className="flex justify-between items-center p-2 border-2 border-surface-700 bg-surface-800">
                <span className="text-xs uppercase text-white font-bold">{m} {m === currentUsername && "(YOU)"}</span>
                {m !== currentUsername && (
                  <button
                    onClick={() => onRemoveMember(group.id, m)}
                    className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase cursor-pointer"
                  >
                    [REMOVE]
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <span className="block text-xs uppercase font-bold text-surface-400 mb-2 tracking-wider">
            ADD MEMBER
          </span>
          <div className="max-h-40 overflow-y-auto border-2 border-surface-600 p-2 space-y-1 bg-surface-900/40">
            {availableToAdd.length === 0 ? (
              <div className="p-2 text-center text-xs text-surface-500 font-bold uppercase">
                No contacts available to add
              </div>
            ) : (
              availableToAdd.map(c => (
                <div key={c.username} className="flex justify-between items-center p-2 border-2 border-surface-700 bg-surface-800">
                  <span className="text-xs uppercase text-white font-bold">{c.username}</span>
                  <button
                    onClick={() => onAddMember(group.id, c.username)}
                    className="text-[10px] text-accent hover:text-white font-bold uppercase cursor-pointer"
                  >
                    [ADD]
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold uppercase border-2 border-surface-600 text-surface-400 hover:text-white hover:border-surface-400 transition-colors cursor-pointer rounded-none"
          >
            DONE
          </button>
        </div>
      </div>
    </Modal>
  );
}
