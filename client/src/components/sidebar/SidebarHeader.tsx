interface Props {
  currentUsername: string;
  onLogout: () => void;
}

export function SidebarHeader({ currentUsername, onLogout }: Props) {
  return (
    <div className="px-4 py-4 border-b border-surface-600 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-widest">SecureChat</p>
        <p className="text-sm text-white mt-0.5 font-medium truncate">{currentUsername}</p>
      </div>
      <button
        onClick={onLogout}
        title="Logout"
        className="shrink-0 p-1.5 rounded-lg text-zinc-600 hover:text-zinc-400 hover:bg-surface-600 transition-colors cursor-pointer"
      >
        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
        </svg>
      </button>
    </div>
  );
}
