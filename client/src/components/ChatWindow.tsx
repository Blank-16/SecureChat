import { useEffect, useRef } from "react";
import type { Message, ConnectionStatus } from "../types";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { ConnectionBanner } from "./chat/ConnectionBanner";
import { ChatHeader } from "./chat/ChatHeader";
import { EmptyState } from "./chat/EmptyState";
import { TypingIndicator } from "./chat/TypingIndicator";

interface Props {
  currentUsername: string;
  peerUsername: string | null;
  messages: Message[];
  peerIsTyping: boolean;
  connectionStatus: ConnectionStatus;
  onSend: (text: string) => Promise<boolean>;
  onTypingChange: (isTyping: boolean) => void;
  onMenuOpen: () => void;
}

export function ChatWindow({
  currentUsername,
  peerUsername,
  messages,
  peerIsTyping,
  connectionStatus,
  onSend,
  onTypingChange,
  onMenuOpen,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, peerIsTyping]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-surface-900 min-w-0">
      <ConnectionBanner status={connectionStatus} />
      <ChatHeader peerUsername={peerUsername} peerIsTyping={peerIsTyping} onMenuOpen={onMenuOpen} />

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {!peerUsername ? (
          <EmptyState />
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 text-sm">No messages yet. Say hello!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} isSelf={msg.from === currentUsername} />
          ))
        )}

        {peerIsTyping && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      <MessageInput
        onSend={onSend}
        onTypingChange={onTypingChange}
        disabled={!peerUsername || connectionStatus !== "connected"}
      />
    </div>
  );
}
