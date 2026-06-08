import { useState, useEffect, useRef, useMemo } from "react";
import { useChat } from "../hooks/useChat";
import { useTypingDebounce } from "../hooks/useTypingDebounce";
import { useAuthStore } from "../store/authStore";
import { useChatStore } from "../store/chatStore";
import { useContactsStore } from "../store/contactsStore";
import { useTypingStore } from "../store/typingStore";
import { useUiStore } from "../store/uiStore";
import { useToastStore } from "../store/toastStore";
import { formatTime } from "../lib/formatTime";
import { AddContactModal } from "./AddContactModal";
import { ConfirmModal } from "./ConfirmModal";
import { SafetyNumberModal } from "./SafetyNumberModal";
import { CreateGroupModal } from "./CreateGroupModal";

type ActiveModal =
  | { kind: "addContact" }
  | { kind: "createGroup" }
  | { kind: "deleteChat"; peer: string }
  | { kind: "block"; peer: string }
  | { kind: "safetyNumber"; peer: string; peerKey: string; ownKey: string }
  | null;

export function ChatDashboard() {
  const currentUsername = useAuthStore((s) => s.username);
  const logout = useAuthStore((s) => s.logout);

  const selectedUser = useUiStore((s) => s.selectedUser);
  const setSelectedUser = useUiStore((s) => s.setSelectedUser);
  const selectedGroup = useUiStore((s) => s.selectedGroup);
  const setSelectedGroup = useUiStore((s) => s.setSelectedGroup);
  const mobileMenuOpen = useUiStore((s) => s.mobileMenuOpen);
  const setMobileMenuOpen = useUiStore((s) => s.setMobileMenuOpen);

  const contacts = useContactsStore((s) => s.contacts);
  const groups = useContactsStore((s) => s.groups);
  const unreadCounts = useContactsStore((s) => s.unreadCounts);
  const clearUnread = useContactsStore((s) => s.clearUnread);

  const { addToast } = useToastStore();

  const {
    wsStatus,
    publicKeyB64,
    ensurePublicKey,
    sendMessage,
    selectUser,
    selectGroup,
    loadHistory,
    sendTyping,
    addContact,
    createGroup,
    sendGroupMessage,
    blockUser,
    deleteChat,
  } = useChat(true);

  const activeMessages = useChatStore(
    (s) => selectedGroup
      ? s.conversations["group:" + selectedGroup]
      : (selectedUser ? s.conversations[selectedUser] : null)
  );

  const isPeerTyping = useTypingStore(
    (s) => (selectedUser ? !!s.typingUsers[selectedUser] : false)
  );

  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { onInput, onStop } = useTypingDebounce((isTyping) => {
    if (selectedUser) sendTyping(selectedUser, isTyping);
  });

  function handleSelectPeer(peer: string) {
    onStop();
    setSelectedUser(peer);
    clearUnread(peer);
    selectUser(peer);
    setMobileMenuOpen(false);
  }

  function handleSelectGroup(groupId: number) {
    onStop();
    setSelectedGroup(groupId);
    const groupKey = "group:" + groupId;
    clearUnread(groupKey);
    selectGroup(groupId);
    setMobileMenuOpen(false);
  }

  useEffect(() => {
    if (selectedUser) {
      loadHistory(selectedUser);
      clearUnread(selectedUser);
    }
  }, [selectedUser, loadHistory, clearUnread]);

  useEffect(() => {
    if (selectedGroup) {
      const groupKey = "group:" + selectedGroup;
      loadHistory(groupKey);
      clearUnread(groupKey);
    }
  }, [selectedGroup, loadHistory, clearUnread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages?.length, isPeerTyping]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const cleanText = text.trim();
    if (!cleanText) return;

    onStop();
    setText("");

    let ok = false;
    if (selectedGroup) {
      ok = await sendGroupMessage(selectedGroup, cleanText);
    } else if (selectedUser) {
      ok = await sendMessage(selectedUser, cleanText);
    }

    if (!ok) {
      setText(cleanText);
      addToast("Failed to send message: encryption keys not ready", "error");
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setText(e.target.value);
    onInput();
  }

  const filteredContacts = useMemo(() =>
    contacts
      .filter(u => u.username !== currentUsername)
      .filter(u =>
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.displayName.toLowerCase().includes(search.toLowerCase())
      ),
    [contacts, currentUsername, search]
  );

  return (
    <>
      {activeModal?.kind === "addContact" && (
        <AddContactModal
          onAdd={(username) => addContact(username)}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal?.kind === "createGroup" && (
        <CreateGroupModal
          onCreate={(name, members) => createGroup(name, members)}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal?.kind === "deleteChat" && (
        <ConfirmModal
          title="DELETE_CHAT"
          message={`Permanently delete all messages with ${activeModal.peer}? This cannot be undone and affects both parties.`}
          confirmLabel="DELETE"
          danger
          onConfirm={() => {
            deleteChat(activeModal.peer);
            setSelectedUser(null);
          }}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal?.kind === "block" && (
        <ConfirmModal
          title="BLOCK_USER"
          message={`Block ${activeModal.peer}? You will no longer receive their messages.`}
          confirmLabel="BLOCK"
          danger
          onConfirm={() => {
            blockUser(activeModal.peer);
            setSelectedUser(null);
          }}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal?.kind === "safetyNumber" && (
        <SafetyNumberModal
          peer={activeModal.peer}
          peerKey={activeModal.peerKey}
          ownKey={activeModal.ownKey}
          onClose={() => setActiveModal(null)}
        />
      )}

      <div className="flex h-screen bg-surface-900 font-mono text-white select-none selection:bg-accent selection:text-white">
        <div className="flex w-full max-w-7xl mx-auto border-2 border-surface-600 bg-surface-900 my-0 lg:my-4 h-full lg:h-[calc(100vh-2rem)] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-none overflow-hidden">

          {/* Sidebar */}
          <div className={`${mobileMenuOpen ? "flex" : "hidden"} lg:flex flex-col w-full lg:w-80 shrink-0 border-r-2 border-surface-600 bg-surface-800 z-30 h-full`}>
            <div className="p-4 border-b-2 border-surface-600 flex justify-between items-center bg-surface-900">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-none border border-black ${wsStatus === "connected" ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                <span className="font-bold text-sm tracking-tight truncate max-w-[120px] uppercase">{currentUsername}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-emerald-950 border border-emerald-500 text-emerald-500 text-[10px] font-bold px-1.5 py-0.5 rounded-none select-none flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  E2EE
                </div>
                <button
                  onClick={() => void logout()}
                  aria-label="Logout"
                  className="text-surface-500 hover:text-red-400 font-bold text-xs border border-surface-600 bg-surface-900 px-2 py-1 hover:border-red-500 transition-colors cursor-pointer"
                >
                  LOGOUT
                </button>
              </div>
            </div>

            <div className="p-4 border-b-2 border-surface-600 bg-surface-900 flex flex-col gap-2">
              <button
                onClick={() => setActiveModal({ kind: "addContact" })}
                className="w-full bg-surface-800 border-2 border-surface-600 text-surface-300 hover:text-accent hover:border-accent font-bold uppercase text-xs py-2 transition-colors flex items-center justify-center gap-2 cursor-pointer select-none rounded-none"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                </svg>
                ADD_CONTACT
              </button>
              <label htmlFor="search-contacts" className="sr-only">Search contacts</label>
              <input
                id="search-contacts"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="SEARCH_CONTACTS..."
                className="w-full bg-surface-800 border-2 border-surface-600 px-3 py-2 text-xs font-semibold focus:outline-none focus:border-accent rounded-none transition-all placeholder:text-surface-600"
              />
            </div>

            <div className="flex-1 overflow-y-auto bg-surface-800 flex flex-col">
              <div className="border-b-2 border-surface-700 bg-surface-850 p-2 text-[10px] font-black tracking-widest text-surface-400 uppercase select-none">
                [CONTACTS]
              </div>
              <div className="divide-y-2 divide-surface-700/50">
                {filteredContacts.length === 0 ? (
                  <div className="p-4 text-center text-xs text-surface-500 select-none uppercase">
                    {search ? "No matches found" : "No contacts yet"}
                  </div>
                ) : (
                  filteredContacts.map((user) => {
                    const isSelected = selectedUser === user.username;
                    const unread = unreadCounts[user.username] ?? 0;
                    return (
                      <button
                        key={user.id}
                        onClick={() => handleSelectPeer(user.username)}
                        className={`w-full text-left p-4 flex items-center justify-between border-l-4 transition-all hover:bg-surface-700/40 cursor-pointer select-none rounded-none ${
                          isSelected ? "border-accent bg-surface-700/60" : "border-transparent bg-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`w-2.5 h-2.5 shrink-0 border border-black ${user.online ? "bg-emerald-500 shadow-[0_0_4px_0_#10b981]" : "bg-surface-600"}`} />
                          <div className="flex flex-col truncate">
                            <span className={`text-sm truncate uppercase tracking-tight ${isSelected ? "font-bold text-white" : "text-surface-300"}`}>
                              {user.displayName || user.username}
                            </span>
                            {user.displayName && user.displayName !== user.username && (
                              <span className="text-[10px] text-surface-500 truncate uppercase">@{user.username}</span>
                            )}
                          </div>
                        </div>
                        {unread > 0 && (
                          <span className="bg-accent border border-black text-black text-[10px] font-black px-1.5 rounded-none min-w-[20px] text-center select-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                            {unread}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="border-t-2 border-b-2 border-surface-700 bg-surface-850 p-2 text-[10px] font-black tracking-widest text-surface-400 uppercase select-none flex justify-between items-center mt-2">
                <span>[SECURE_GROUPS]</span>
                <button
                  onClick={() => setActiveModal({ kind: "createGroup" })}
                  className="text-[9px] border border-surface-600 bg-surface-900 px-2 py-0.5 hover:text-accent hover:border-accent font-bold cursor-pointer transition-colors"
                >
                  + NEW
                </button>
              </div>
              <div className="divide-y-2 divide-surface-700/50 flex-1">
                {groups.length === 0 ? (
                  <div className="p-6 text-center text-xs text-surface-500 select-none uppercase">
                    No secure groups
                  </div>
                ) : (
                  groups.map((group) => {
                    const isSelected = selectedGroup === group.id;
                    const groupKey = "group:" + group.id;
                    const unread = unreadCounts[groupKey] ?? 0;
                    return (
                      <button
                        key={group.id}
                        onClick={() => handleSelectGroup(group.id)}
                        className={`w-full text-left p-4 flex items-center justify-between border-l-4 transition-all hover:bg-surface-700/40 cursor-pointer select-none rounded-none ${
                          isSelected ? "border-accent bg-surface-700/60" : "border-transparent bg-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <svg className="w-4 h-4 shrink-0 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          <div className="flex flex-col truncate">
                            <span className={`text-sm truncate uppercase tracking-tight ${isSelected ? "font-bold text-white" : "text-surface-300"}`}>
                              {group.name}
                            </span>
                            <span className="text-[9px] text-surface-500 truncate uppercase">
                              {group.members.length} members
                            </span>
                          </div>
                        </div>
                        {unread > 0 && (
                          <span className="bg-accent border border-black text-black text-[10px] font-black px-1.5 rounded-none min-w-[20px] text-center select-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                            {unread}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Chat Panel */}
          <div className="flex-1 flex flex-col bg-surface-900 h-full relative">

            <div className="lg:hidden p-3 border-b-2 border-surface-600 flex items-center justify-between bg-surface-800">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label={mobileMenuOpen ? "Close roster" : "Open roster"}
                className="border-2 border-surface-600 bg-surface-900 p-2 font-bold text-xs flex items-center gap-2 cursor-pointer active:bg-surface-700"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                {mobileMenuOpen ? "CLOSE_ROSTER" : "OPEN_ROSTER"}
              </button>
              <span className="font-bold text-xs uppercase text-accent truncate">
                {selectedGroup
                  ? `GROUP: ${groups.find(g => g.id === selectedGroup)?.name ?? ""}`
                  : (selectedUser ? `PEER: ${selectedUser}` : "SECURE_CHAT")}
              </span>
            </div>

            {selectedUser || selectedGroup ? (
              <>
                <div className="hidden lg:flex p-4 border-b-2 border-surface-600 items-center justify-between bg-surface-800">
                  <div className="flex items-center gap-2">
                    {selectedGroup ? (
                      <>
                        <svg className="w-5 h-5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-sm uppercase tracking-tight text-white">
                            {groups.find(g => g.id === selectedGroup)?.name}
                          </span>
                          <span className="text-[9px] text-surface-500 uppercase tracking-widest mt-0.5 truncate max-w-lg">
                            MEMBERS: {groups.find(g => g.id === selectedGroup)?.members.join(", ")}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                        <span className="font-bold text-sm uppercase tracking-tight text-white">{selectedUser}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {selectedUser && (
                      <>
                        <button
                          onClick={() => setActiveModal({ kind: "deleteChat", peer: selectedUser })}
                          className="text-[10px] font-bold px-2 py-0.5 border border-surface-600 text-surface-400 hover:text-red-400 hover:border-red-500 uppercase transition-colors cursor-pointer"
                        >
                          DELETE_CHAT
                        </button>
                        <button
                          onClick={() => setActiveModal({ kind: "block", peer: selectedUser })}
                          className="text-[10px] font-bold px-2 py-0.5 border border-surface-600 text-surface-400 hover:text-red-400 hover:border-red-500 uppercase transition-colors cursor-pointer"
                        >
                          BLOCK
                        </button>
                        <button
                          onClick={async () => {
                            if (!publicKeyB64) return;
                            const pk = await ensurePublicKey(selectedUser);
                            if (pk) {
                              setActiveModal({
                                kind: "safetyNumber",
                                peer: selectedUser,
                                peerKey: pk,
                                ownKey: publicKeyB64,
                              });
                            }
                          }}
                          className="bg-emerald-950 hover:bg-emerald-900 border border-emerald-500 text-emerald-400 hover:text-emerald-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded-none flex items-center gap-1 cursor-pointer transition-colors"
                          title="Verify Safety Numbers"
                        >
                          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          E2E_VERIFIED
                        </button>
                      </>
                    )}
                    {selectedGroup && (
                      <div className="bg-emerald-950 border border-emerald-500 text-emerald-400 text-[10px] font-mono font-bold px-2 py-0.5 rounded-none flex items-center gap-1 select-none">
                        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        GROUP_E2EE_ACTIVE
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-surface-900/40">
                  {!activeMessages || activeMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center flex-col text-center p-8 select-none">
                      <div className="border-2 border-surface-600 bg-surface-800 p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] rounded-none">
                        <svg className="w-8 h-8 text-surface-500 mx-auto" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                        </svg>
                        <h3 className="font-bold text-xs uppercase tracking-wider text-white mt-3">Beginning of Secure Log</h3>
                        <p className="text-[10px] text-surface-500 mt-1 uppercase max-w-xs leading-relaxed">
                          Say hello to {selectedUser}. All messages are end-to-end encrypted.
                        </p>
                      </div>
                    </div>
                  ) : (
                    activeMessages.map((msg) => {
                      const isSelf = msg.from === currentUsername;
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isSelf ? "justify-end" : "justify-start"} animate-slide-up`}
                        >
                          <div
                            className={`max-w-[80%] p-3.5 border-2 rounded-none shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${
                              isSelf
                                ? "bg-accent border-black text-black"
                                : "bg-surface-800 border-surface-600 text-peer-text"
                            }`}
                          >
                            {!isSelf && selectedGroup && (
                              <div className="text-[9px] uppercase font-bold text-surface-500 mb-1 tracking-widest border-b border-surface-600/50 pb-0.5 inline-block">
                                {msg.from}
                              </div>
                            )}
                            {msg.decryptError ? (
                              <div className="bg-red-950/70 border border-red-500 text-red-400 p-2 text-[10px] uppercase font-bold flex items-center gap-1.5">
                                <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                Decryption Failed (Key Mismatch)
                              </div>
                            ) : (
                              <p className="text-xs break-words font-semibold tracking-tight whitespace-pre-wrap leading-relaxed select-text">
                                {msg.plaintext !== undefined ? msg.plaintext : (
                                  <span className="opacity-40 italic">decrypting...</span>
                                )}
                              </p>
                            )}
                            <div className="mt-2 flex items-center justify-between gap-6 text-[9px] uppercase tracking-wide opacity-65 font-bold">
                              <span>{formatTime(msg.timestamp)}</span>
                              {isSelf && (
                                <span className="font-extrabold tracking-widest text-[8px]">
                                  {msg.sendStatus === "sending" ? "PENDING" : msg.sendStatus === "failed" ? "FAILED" : "SECURED"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {isPeerTyping && (
                    <div className="flex justify-start animate-slide-up">
                      <div className="bg-surface-800 border-2 border-surface-600 p-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] rounded-none text-peer-text flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-accent">{selectedUser}_TYPING</span>
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-accent border border-black animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-1.5 h-1.5 bg-accent border border-black animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-1.5 h-1.5 bg-accent border border-black animate-bounce" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSend} className="p-4 border-t-2 border-surface-600 bg-surface-850 flex gap-3">
                  <label htmlFor="message-input" className="sr-only">Message {selectedGroup ? "Group" : selectedUser}</label>
                  <input
                    id="message-input"
                    type="text"
                    value={text}
                    onChange={handleInputChange}
                    placeholder={selectedGroup ? "MESSAGE_GROUP..." : `MESSAGE_${(selectedUser ?? "").toUpperCase()}...`}
                    className="flex-1 bg-surface-900 border-2 border-surface-600 px-4 py-3 text-xs font-semibold focus:outline-none focus:border-accent rounded-none transition-all placeholder:text-surface-600"
                  />
                  <button
                    type="submit"
                    disabled={!text.trim()}
                    aria-label="Send message"
                    className={`px-6 py-3 border-2 font-bold uppercase text-xs tracking-wider rounded-none transition-all flex items-center gap-2 select-none cursor-pointer ${
                      !text.trim()
                        ? "bg-surface-700 border-surface-600 text-surface-500 cursor-not-allowed"
                        : "bg-accent border-black text-black shadow-[3px_3px_0px_0px_rgba(124,106,245,0.2)] hover:shadow-none hover:translate-x-[1.5px] hover:translate-y-[1.5px] active:translate-x-[3px] active:translate-y-[3px]"
                    }`}
                  >
                    SEND
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 bg-surface-900/60 text-center font-mono">
                <div className="max-w-md border-2 border-surface-600 bg-surface-800 p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-none space-y-6">
                  <div className="mx-auto w-16 h-16 bg-accent border-2 border-black flex items-center justify-center text-black font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-md font-bold uppercase tracking-widest text-white">SECURE_WORKSPACE_ACTIVE</h2>
                    <p className="text-xs uppercase text-accent font-bold tracking-wider">[Status: E2EE_READY]</p>
                  </div>
                  <p className="text-xs text-surface-400 leading-relaxed uppercase">
                    Select a contact from the sidebar to establish a secure, end-to-end encrypted channel.
                  </p>
                  <div className="border-t-2 border-surface-700/60 pt-4 flex flex-col gap-2 text-[10px] text-surface-500 text-left font-bold uppercase">
                    <div>- Channel Security: RSA-OAEP-2048</div>
                    <div>- Session Protection: AES-GCM-256</div>
                    <div>- Key Storage: PBKDF2-AES-WRAP</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
