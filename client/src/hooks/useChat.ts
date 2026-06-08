import { useCallback, useRef, useEffect, useMemo } from "react";
import { useEncryption } from "./useEncryption";
import { useWebSocket } from "./useWebSocket";
import { useAuthStore } from "../store/authStore";
import { useChatStore, nextOptimisticId } from "../store/chatStore";
import { useContactsStore } from "../store/contactsStore";
import type { Message } from "../types";
import { cacheMessage, getCachedMessages, clearCache } from "../utils/messageCache";

export function useChat(authenticated: boolean) {
  const { publicKeyB64, encryptFor, decryptOwn, ready } = useEncryption();
  const ws = useWebSocket(authenticated && ready);

  const keyCache = useRef<Map<string, string>>(new Map());
  const keyRequests = useRef<Map<string, Array<(key: string | null) => void>>>(new Map());

  const authState = useAuthStore((s) => s.authState);
  useEffect(() => {
    if (authState === "unauthenticated") {
      void clearCache();
    }
  }, [authState]);

  useEffect(() => {
    ws.setPublicKeyHandler((username, key) => {
      keyCache.current.set(username, key);
      const resolvers = keyRequests.current.get(username) ?? [];
      keyRequests.current.delete(username);
      resolvers.forEach(resolve => resolve(key));
    });
    return () => { ws.setPublicKeyHandler(() => {}); };
  }, [ws]);

  // Invalidate key cache on reconnect
  useEffect(() => {
    if (ws.status === "connected") {
      keyCache.current.clear();
    }
  }, [ws.status]);

  const ensurePublicKey = useCallback(async (username: string): Promise<string | null> => {
    if (keyCache.current.has(username)) return keyCache.current.get(username)!;

    return new Promise((resolve) => {
      const existing = keyRequests.current.get(username);
      if (existing) {
        existing.push(resolve);
      } else {
        keyRequests.current.set(username, [resolve]);
        ws.requestPublicKey(username);
      }
      // Timeout after 5s
      setTimeout(() => {
        const queue = keyRequests.current.get(username);
        if (queue) {
          const idx = queue.indexOf(resolve);
          if (idx !== -1) queue.splice(idx, 1);
          if (queue.length === 0) keyRequests.current.delete(username);
        }
        resolve(null);
      }, 5_000);
    });
  }, [ws]);

  const decryptAndStore = useCallback(async (msg: Message, peer: string) => {
    let plaintext = "";
    let decryptError = false;
    try {
      plaintext = await decryptOwn(msg.ciphertext);
    } catch {
      decryptError = true;
    }
    useChatStore.getState().setDecrypted(peer, msg.id, plaintext, decryptError);
    void cacheMessage(peer, { ...msg, plaintext, decryptError });
  }, [decryptOwn]);

  const selectUser = useCallback(async (peer: string) => {
    const cached = await getCachedMessages(peer);
    if (cached.length > 0) {
      useChatStore.getState().setHistory(peer, cached);
    }
    if (!keyCache.current.has(peer) && !keyRequests.current.has(peer)) {
      keyRequests.current.set(peer, []);
      ws.requestPublicKey(peer);
    }
    ws.requestHistory(peer);
  }, [ws]);

  const sendMessage = useCallback(async (to: string, text: string): Promise<boolean> => {
    if (!publicKeyB64) return false;

    const recipientKey = await ensurePublicKey(to);
    if (!recipientKey) return false;

    const optimisticId = nextOptimisticId();
    const self = useAuthStore.getState().username;
    if (!self) return false;

    const optimistic: Message = {
      id: optimisticId,
      from: self,
      to,
      ciphertext: "",
      plaintext: text,
      timestamp: new Date().toISOString(),
      sendStatus: "sending",
    };

    useChatStore.getState().append(to, optimistic);

    try {
      const [ciphertext, senderCiphertext] = await Promise.all([
        encryptFor(text, recipientKey),
        encryptFor(text, publicKeyB64),
      ]);
      ws.sendMessage(to, ciphertext, senderCiphertext);
      return true;
    } catch {
      useChatStore.getState().fail(to, optimisticId);
      return false;
    }
  }, [publicKeyB64, encryptFor, ensurePublicKey, ws]);

  const loadHistory = useCallback((peer: string) => {
    const msgs = useChatStore.getState().getMessages(peer);
    msgs.forEach((msg) => {
      if (!msg.plaintext && !msg.decryptError) {
        void decryptAndStore(msg, peer);
      }
    });
  }, [decryptAndStore]);

  const selectGroup = useCallback(async (groupId: number) => {
    const groupKey = "group:" + groupId;
    const cached = await getCachedMessages(groupKey);
    if (cached.length > 0) {
      useChatStore.getState().setHistory(groupKey, cached);
    }
    ws.requestGroupHistory(groupId);
  }, [ws]);

  const sendGroupMessage = useCallback(async (groupId: number, text: string): Promise<boolean> => {
    if (!publicKeyB64) return false;

    const group = useContactsStore.getState().groups.find(g => g.id === groupId);
    if (!group) return false;

    const groupKey = "group:" + groupId;
    const optimisticId = nextOptimisticId();
    const self = useAuthStore.getState().username;
    if (!self) return false;

    const optimistic: Message = {
      id: optimisticId,
      from: self,
      to: groupKey,
      ciphertext: "",
      plaintext: text,
      timestamp: new Date().toISOString(),
      sendStatus: "sending",
    };

    useChatStore.getState().append(groupKey, optimistic);

    try {
      const envelopes: Record<string, string> = {};
      await Promise.all(
        group.members.map(async (username) => {
          const pk = (username === self) ? publicKeyB64 : await ensurePublicKey(username);
          if (pk) {
            envelopes[username] = await encryptFor(text, pk);
          }
        })
      );

      ws.sendGroupMessage(groupId, envelopes);
      return true;
    } catch {
      useChatStore.getState().fail(groupKey, optimisticId);
      return false;
    }
  }, [publicKeyB64, encryptFor, ensurePublicKey, ws]);

  return useMemo(() => ({
    ready,
    publicKeyB64,
    ensurePublicKey,
    wsStatus: ws.status,
    sendMessage,
    selectUser,
    selectGroup,
    loadHistory,
    decryptAndStore,
    createGroup: ws.createGroup,
    sendGroupMessage,
    sendTyping: ws.sendTyping,
    addContact: ws.addContact,
    removeContact: ws.removeContact,
    blockUser: ws.blockUser,
    unblockUser: ws.unblockUser,
    deleteChat: ws.deleteChat,
  }), [ready, publicKeyB64, ensurePublicKey, ws.status, sendMessage, selectUser, selectGroup, loadHistory, decryptAndStore,
    ws.createGroup, sendGroupMessage, ws.sendTyping, ws.addContact, ws.removeContact, ws.blockUser, ws.unblockUser, ws.deleteChat]);
}
