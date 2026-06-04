import { Avatar } from "../ui/Avatar";

interface Props {
  peerUsername: string | null;
  peerIsTyping: boolean;
  onMenuOpen: () => void;
}

export function ChatHeader({ peerUsername, peerIsTyping, onMenuOpen }: Props) {
  return (
    <header className="px-4 py-3.5 border-b border-surface-600 bg-surface-800 flex items-center gap-3 shrink-0">
      <button
        onClick={onMenuOpen}
        className="md:hidden shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-surface-600 transition-colors cursor-pointer"
      >
        <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {peerUsername ? (
        <>
          <Avatar username={peerUsername} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{peerUsername}</p>
            {peerIsTyping && <p className="text-xs text-accent animate-fade-in">typing…</p>}
          </div>
        </>
      ) : (
        <p className="text-sm font-medium text-zinc-500 flex-1">SecureChat</p>
      )}

      <div className="flex items-center gap-1.5 shrink-0">
        <svg className="size-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
          <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
        </svg>
        <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">E2EE</span>
      </div>
    </header>
  );
}
