import type { User } from "../types";
import { SidebarHeader } from "./sidebar/SidebarHeader";
import { UserListItem } from "./sidebar/UserListItem";

interface Props {
  users: User[];
  currentUsername: string;
  selectedUsername: string | null;
  onSelect: (username: string) => void;
  typingUsers: Set<string>;
  unreadCounts: Map<string, number>;
  onLogout: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function ConversationList({
  users,
  currentUsername,
  selectedUsername,
  onSelect,
  typingUsers,
  unreadCounts,
  onLogout,
  mobileOpen,
  onMobileClose,
}: Props) {
  const others = users.filter((u) => u.username !== currentUsername);

  function handleSelect(username: string) {
    onSelect(username);
    onMobileClose();
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 md:hidden animate-fade-in"
          onClick={onMobileClose}
        />
      )}
      <aside className={[
        "flex flex-col bg-surface-800 border-r border-surface-600 overflow-hidden z-30",
        "fixed inset-y-0 left-0 w-72 transition-transform duration-300 md:relative md:translate-x-0 md:w-64",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
      ].join(" ")}>
        <SidebarHeader currentUsername={currentUsername} onLogout={onLogout} />
        <div className="flex-1 overflow-y-auto">
          {others.length === 0 ? (
            <p className="text-xs text-zinc-600 px-4 py-6 text-center leading-relaxed">
              No other users yet. Share your username to chat.
            </p>
          ) : (
            <ul className="py-1">
              {others.map((user) => (
                <UserListItem
                  key={user.id}
                  user={user}
                  isSelected={selectedUsername === user.username}
                  isTyping={typingUsers.has(user.username)}
                  unreadCount={unreadCounts.get(user.username) ?? 0}
                  onSelect={handleSelect}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
