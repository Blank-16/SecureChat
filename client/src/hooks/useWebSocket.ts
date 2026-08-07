import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { ConnectionStatus, ServerEnvelope, Message, User, Group } from "../types";
import { WS_URL, RECONNECT_DELAY_MS } from "../lib/constants";
import { useAuthStore } from "../store/authStore";
import { useChatStore } from "../store/chatStore";
import { useContactsStore } from "../store/contactsStore";
import { useTypingStore } from "../store/typingStore";
import { useUiStore } from "../store/uiStore";

export type PublicKeyHandler = (username: string, keys: { identityKey: string; preKey: string; preKeySignature: string }) => void;

export interface UseWebSocketReturn {
  status: ConnectionStatus;
  sendMessage: (to: string, ciphertext: string, senderCiphertext: string) => void;
  requestHistory: (withUser: string) => void;
  requestPublicKey: (username: string) => void;
  sendTyping: (to: string, isTyping: boolean) => void;
  setPublicKeyHandler: (handler: PublicKeyHandler) => void;
  addContact: (username: string) => void;
  createGroup: (name: string, keys: Record<string, string>) => void;
  getGroups: () => void;
  sendGroupMessage: (groupId: number, ciphertext: string, keyId: number) => void;
  addGroupMember: (groupId: number, username: string, encryptedKey: string, keyId: number) => void;
  removeGroupMember: (groupId: number, username: string) => void;
  rotateGroupKey: (groupId: number, keys: Record<string, string>) => void;
  requestGroupKeys: (groupId: number) => void;
  requestGroupHistory: (groupId: number) => void;
  removeContact: (username: string) => void;
  blockUser: (username: string) => void;
  unblockUser: (username: string) => void;
  deleteChat: (username: string) => void;
}

const MAX_RECONNECT_DELAY_MS = 30_000;

export function useWebSocket(authenticated: boolean): UseWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(RECONNECT_DELAY_MS);
  const activeConversationRef = useRef<string | null>(null);
  const publicKeyHandlerRef = useRef<PublicKeyHandler | null>(null);
  const isMountedRef = useRef(true);

  const sendRaw = useCallback((payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING) return;

    setStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectDelay.current = RECONNECT_DELAY_MS;
      setStatus("connected");
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      let envelope: ServerEnvelope;
      try {
        const parsed = JSON.parse(event.data);
        if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") return;
        envelope = parsed as ServerEnvelope;
      } catch {
        return;
      }
      const { type, payload } = envelope;

      switch (type) {
        case "registered": {
          const p = payload as { userId: number; username: string; displayName: string };
          useAuthStore.getState().setAuthenticated(p.username, p.displayName ?? "");
          sendRaw({ type: "get_contacts" });
          sendRaw({ type: "get_groups" });
          if (activeConversationRef.current) {
            if (activeConversationRef.current.startsWith("group:")) {
              const gid = parseInt(activeConversationRef.current.split(":")[1], 10);
              sendRaw({ type: "get_group_history", payload: { groupId: gid } });
            } else {
              sendRaw({ type: "get_history", payload: { with: activeConversationRef.current } });
            }
          }
          break;
        }
        case "message": {
          const p = payload as unknown as Message;
          const self = useAuthStore.getState().username;
          const peer = p.from === self ? p.to : p.from;

          if (p.from === self) {
            const msgs = useChatStore.getState().getMessages(peer);
            const pendingMsg = msgs.find(m => m.id < 0 && m.sendStatus === "sending");
            if (pendingMsg) {
              p.plaintext = pendingMsg.plaintext;
              p.sendStatus = "send";
              useChatStore.getState().confirm(peer, pendingMsg.id, p);
            }
          } else {
            useChatStore.getState().append(peer, p);
            if (useUiStore.getState().selectedUser !== p.from) {
              useContactsStore.getState().incrementUnread(p.from);
            }
            const currentContacts = useContactsStore.getState().contacts;
            if (!currentContacts.some(c => c.username === peer)) {
              sendRaw({ type: "get_contacts" });
            }
          }
          break;
        }
        case "history": {
          const p = payload as { with: string; messages: Message[] };
          useChatStore.getState().setHistory(p.with, p.messages);
          break;
        }
        case "contacts": {
          const p = payload as { contacts: User[]; blocked: User[] };
          useContactsStore.getState().setContacts(p.contacts);
          useContactsStore.getState().setBlocked(p.blocked);
          break;
        }
        case "user_status": {
          const p = payload as { username: string; online: boolean };
          useContactsStore.getState().updateContactStatus(p.username, p.online);
          break;
        }
        case "public_key": {
          const p = payload as { username: string; identityKey: string; preKey: string; preKeySignature: string };
          publicKeyHandlerRef.current?.(p.username, { identityKey: p.identityKey, preKey: p.preKey, preKeySignature: p.preKeySignature });
          break;
        }
        case "typing": {
          const p = payload as { from: string; isTyping: boolean };
          useTypingStore.getState().setTyping(p.from, p.isTyping);
          break;
        }
        case "chat_deleted": {
          const p = payload as { with: string };
          useChatStore.getState().setHistory(p.with, []);
          sendRaw({ type: "get_contacts" });
          break;
        }
        case "group_updated": {
          const p = payload as unknown as Group;
          const self = useAuthStore.getState().username;
          if (self && !p.members.includes(self)) {
            useContactsStore.getState().removeGroup(p.id);
          } else {
            useContactsStore.getState().updateGroup(p);
          }
          break;
        }
        case "group_keys": {
          const p = payload as { groupId: number; keys: Array<{ keyId: number, encryptedKey: string }> };
          useChatStore.getState().setGroupKeys(p.groupId, p.keys);
          break;
        }
        case "group_created": {
          const p = payload as unknown as Group;
          useContactsStore.getState().addGroup(p);
          break;
        }
        case "groups": {
          const p = payload as unknown as { groups: Group[] };
          useContactsStore.getState().setGroups(p.groups);
          break;
        }
        case "group_message": {
          const p = payload as unknown as { id: number; groupId: number; from: string; ciphertext: string; keyId: number; timestamp: string };
          const self = useAuthStore.getState().username;
          const groupKey = "group:" + p.groupId;
          const msg: Message = {
            id: p.id || Date.now(),
            from: p.from,
            to: groupKey,
            ciphertext: p.ciphertext,
            timestamp: p.timestamp,
            keyId: p.keyId
          };
          if (p.from === self) {
            const msgs = useChatStore.getState().getMessages(groupKey);
            const pendingMsg = msgs.find(m => m.id < 0 && m.sendStatus === "sending");
            if (pendingMsg) {
              msg.plaintext = pendingMsg.plaintext;
              msg.sendStatus = "send";
              useChatStore.getState().confirm(groupKey, pendingMsg.id, msg);
            }
          } else {
            useChatStore.getState().append(groupKey, msg);
            if (useUiStore.getState().selectedGroup !== p.groupId) {
              useContactsStore.getState().incrementUnread(groupKey);
            }
          }
          break;
        }
        case "group_history": {
          const p = payload as unknown as { groupId: number; messages: Message[] };
          const groupKey = "group:" + p.groupId;
          const mappedMessages = p.messages.map((m) => ({ ...m, to: groupKey }));
          useChatStore.getState().setHistory(groupKey, mappedMessages);
          break;
        }
        case "error": {
          const p = payload as { message: string };
          if (p.message === "authentication required" || p.message === "invalid session") {
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
      reconnectTimer.current = setTimeout(() => {
        if (isMountedRef.current) connect();
      }, reconnectDelay.current);
      reconnectDelay.current = Math.min(reconnectDelay.current * 2, MAX_RECONNECT_DELAY_MS);
    };

    ws.onerror = () => {
      setStatus("error");
      ws.close();
    };
  }, [sendRaw]);

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
      sendRaw({ type: "send_message", payload: { to, ciphertext, senderCiphertext } }),
    requestHistory: (withUser) => {
      activeConversationRef.current = withUser;
      sendRaw({ type: "get_history", payload: { with: withUser } });
    },
    requestPublicKey: (username) =>
      sendRaw({ type: "request_public_key", payload: { username } }),
    sendTyping: (to, isTyping) =>
      sendRaw({ type: "typing", payload: { to, isTyping } }),
    setPublicKeyHandler: (handler: PublicKeyHandler) => {
      publicKeyHandlerRef.current = handler;
    },
    addContact: (username) => sendRaw({ type: "add_contact", payload: { username } }),
    createGroup: (name: string, keys: Record<string, string>) =>
      sendRaw({ type: "create_group", payload: { name, keys } }),
    getGroups: () =>
      sendRaw({ type: "get_groups" }),
    sendGroupMessage: (groupId: number, ciphertext: string, keyId: number) =>
      sendRaw({ type: "send_group_message", payload: { groupId, ciphertext, keyId } }),
    addGroupMember: (groupId, username, encryptedKey, keyId) => sendRaw({ type: "add_group_member", payload: { groupId, username, encryptedKey, keyId } }),
    removeGroupMember: (groupId, username) => sendRaw({ type: "remove_group_member", payload: { groupId, username } }),
    rotateGroupKey: (groupId, keys) => sendRaw({ type: "rotate_group_key", payload: { groupId, keys } }),
    requestGroupKeys: (groupId) => sendRaw({ type: "get_group_keys", payload: { groupId } }),
    requestGroupHistory: (groupId: number) => {
      activeConversationRef.current = "group:" + groupId;
      sendRaw({ type: "get_group_history", payload: { groupId } });
    },
    removeContact: (username) => sendRaw({ type: "remove_contact", payload: { username } }),
    blockUser: (username) => sendRaw({ type: "block_user", payload: { username } }),
    unblockUser: (username) => sendRaw({ type: "unblock_user", payload: { username } }),
    deleteChat: (username) => sendRaw({ type: "delete_chat", payload: { username } }),
  }), [status, sendRaw]);
}
