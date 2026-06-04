import type { User } from "../../types";
import { Avatar } from "../ui/Avatar";

interface Props {
  user: User;
  isSelected: boolean;
  isTyping: boolean;
  unreadCount: number;
  onSelect: (username: string) => void;
}

export function UserListItem({ user, isSelected, isTyping, unreadCount, onSelect }: Props) {
  return (
    <li>
      <button
        onClick={() => onSelect(user.username)}
        data-selected={isSelected || undefined}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-700 data-[selected]:bg-accent-dim data-[selected]:border-r-2 data-[selected]:border-accent cursor-pointer"
      >
        <Avatar username={user.username} online={user.online} />

        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate font-medium">{user.username}</p>
          {isTyping ? (
            <p className="text-xs text-accent truncate animate-fade-in">typing…</p>
          ) : (
            <p className="text-xs text-zinc-600">{user.online ? "Online" : "Offline"}</p>
          )}
        </div>

        {unreadCount > 0 && !isSelected && (
          <span className="shrink-0 min-w-5 h-5 rounded-full bg-accent text-white text-[10px] font-semibold flex items-center justify-center px-1 animate-fade-in">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    </li>
  );
}
