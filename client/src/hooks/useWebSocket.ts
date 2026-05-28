import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { ConnectionStatus, ServerEnvelope, Message, User } from "../types";
import { WS_URL, RECONNECT_DELAY_MS } from "../lib/constants";
import { useAuthStore } from "../store/authStore";
import { useChatStore } from "../store/chatStore";
import { useUsersStore } from "../store/usersStore";
import { useTypingStore } from "../store/typingStore";
import { useUiStore } from "../store/uiStore";

export type PublicKeyHandler = (username: string, publicKey: string) => void;

export interface UseWebSocketReturn {
  status: ConnectionStatus;
  sendMessage: (
    to: string,
    ciphertext: string,
    senderCiphertext: string,
  ) => void;
  requestHistory: (withUser: string) => void;
  requestPublicKey: (username: string) => void;
  sendTyping: (to: string, isTyping: boolean) => void;
  setPublicKeyHandler: (handler: PublicKeyHandler) => void;
}

export function useWebSocket(authenticated: boolean): UseWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeConversationRef = useRef<string | null>(null);
  const publicKeyHandlerRef = useRef<PublicKeyHandler | null>(null);
  const isMountedRef = useRef(true);

  const sendRaw = useCallback((payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setStatus("connected");

    ws.onmessage = (event: MessageEvent<string>) => {
      let envelope: ServerEnvelope;
      try {
        envelope = JSON.parse(event.data) as ServerEnvelope;
      } catch {
        return;
      }
      const { type, payload } = envelope;

      switch (type) {
        case "registered": {
          const p = payload as { userId: number; username: string };
          useAuthStore.getState().setAuthenticated(p.username);
          if (activeConversationRef.current) {
            ws.send(
              JSON.stringify({
                type: "get_history",
                payload: { with: activeConversationRef.current },
              }),
            );
          }
          break;
        }
        case "message": {
          const p = payload as unknown as Message;
          const self = useAuthStore.getState().username;
          const peer = p.from === self ? p.to : p.from;
          useChatStore.getState().append(peer, p);
          if (
            p.from !== self &&
            useUiStore.getState().selectedUser !== p.from
          ) {
            useUsersStore.getState().incrementUnread(p.from);
          }
          break;
        }
        case "history": {
          const p = payload as { with: string; messages: Message[] };
          useChatStore.getState().setHistory(p.with, p.messages);
          break;
        }
        case "users": {
          const p = payload as { users: User[] };
          useUsersStore.getState().setUsers(p.users);
          break;
        }
        case "user_status": {
          const p = payload as {
            userId: number;
            username: string;
            online: boolean;
          };
          useUsersStore
            .getState()
            .updateUserStatus(p.userId, p.username, p.online);
          break;
        }
        case "public_key": {
          const p = payload as { username: string; publicKey: string };
          publicKeyHandlerRef.current?.(p.username, p.publicKey);
          break;
        }
        case "typing": {
          const p = payload as { from: string; isTyping: boolean };
          useTypingStore.getState().setTyping(p.from, p.isTyping);
          break;
        }
        case "error": {
          const p = payload as { message: string };
          if (
            p.message === "authentication required" ||
            p.message === "invalid session"
          ) {
            useAuthStore.getState().setUnauthenticated();
          }
          console.error("Server error:", p.message);
          break;
        }
      }
    };

    ws.onclose = (event) => {
      setStatus("disconnected");
      if (!isMountedRef.current || event.code === 1008) return;
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    ws.onerror = () => {
      setStatus("error");
      ws.close();
    };
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    if (authenticated) connect();
    return () => {
      isMountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [authenticated, connect]);

  return useMemo(() => ({
    status,
    sendMessage: (to, ciphertext, senderCiphertext) =>
      sendRaw({
        type: "send_message",
        payload: { to, ciphertext, senderCiphertext },
      }),
    requestHistory: (withUser) => {
      activeConversationRef.current = withUser;
      sendRaw({ type: "get_history", payload: { with: withUser } });
    },
    requestPublicKey: (username) =>
      sendRaw({ type: "request_public_key", payload: { username } }),
    sendTyping: (to, isTyping) => sendRaw({ type: "typing", payload: { to, isTyping } }),
    setPublicKeyHandler: (handler: PublicKeyHandler) => {
      publicKeyHandlerRef.current = handler;
    },
  }), [status, sendRaw]);
}
