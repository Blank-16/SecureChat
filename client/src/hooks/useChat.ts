import { useCallback, useRef, useEffect, useMemo } from "react";
import { useEncryption } from "./useEncryption";
import { useWebSocket } from "./useWebSocket";
import { useAuthStore } from "../store/authStore";
import { useChatStore, nextOptimisticId } from "../store/chatStore";
import type { Message } from "../types";
import { KEY_FETCH_RETRIES, KEY_FETCH_INTERVAL_MS } from "../lib/constants";

export function useChat(authenticated: boolean) {
  const { publicKeyB64, encryptFor, decryptOwn, ready } = useEncryption();
  const ws = useWebSocket(authenticated && ready);

  const publicKeyCache = useRef<Map<string, string>>(new Map());
  const pendingKeyRequests = useRef<Set<string>>(new Set());

  // Register public_key handler on mount so ws can forward keys to cache
  useEffect(() => {
    ws.setPublicKeyHandler((username, key) => {
      publicKeyCache.current.set(username, key);
      pendingKeyRequests.current.delete(username);
    });
    return () => {
      ws.setPublicKeyHandler(() => {});
    };
  }, [ws]);

  const decryptAndStore = useCallback(
    async (msg: Message, peer: string) => {
      let plaintext = "";
      let decryptError = false;
      try {
        plaintext = await decryptOwn(msg.ciphertext);
      } catch {
        decryptError = true;
      }
      useChatStore
        .getState()
        .setDecrypted(peer, msg.id, plaintext, decryptError);
    },
    [decryptOwn],
  );

  const ensurePublicKey = useCallback(
    async (username: string): Promise<string | null> => {
      if (publicKeyCache.current.has(username))
        return publicKeyCache.current.get(username)!;

      if (!pendingKeyRequests.current.has(username)) {
        pendingKeyRequests.current.add(username);
        ws.requestPublicKey(username);
      }

      for (let i = 0; i < KEY_FETCH_RETRIES; i++) {
        await new Promise((r) => setTimeout(r, KEY_FETCH_INTERVAL_MS));
        if (publicKeyCache.current.has(username))
          return publicKeyCache.current.get(username)!;
      }
      return null;
    },
    [ws],
  );

  const selectUser = useCallback(
    (peer: string) => {
      if (
        !publicKeyCache.current.has(peer) &&
        !pendingKeyRequests.current.has(peer)
      ) {
        pendingKeyRequests.current.add(peer);
        ws.requestPublicKey(peer);
      }
      ws.requestHistory(peer);
    },
    [ws],
  );

  const sendMessage = useCallback(
    async (to: string, text: string): Promise<boolean> => {
      if (!publicKeyB64) return false;

      const recipientKey = await ensurePublicKey(to);
      if (!recipientKey) return false;

      const optimisticId = nextOptimisticId();
      const self = useAuthStore.getState().username;

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
    },
    [publicKeyB64, encryptFor, ensurePublicKey, ws],
  );

  const loadHistory = useCallback(
    (peer: string) => {
      const msgs = useChatStore.getState().getMessages(peer);
      msgs.forEach((msg) => {
        if (!msg.plaintext && !msg.decryptError) {
          void decryptAndStore(msg, peer);
        }
      });
    },
    [decryptAndStore],
  );

  return useMemo(() => ({
    ready,
    wsStatus: ws.status,
    sendMessage,
    selectUser,
    loadHistory,
    decryptAndStore,
    sendTyping: ws.sendTyping,
  }), [ready, ws.status, sendMessage, selectUser, loadHistory, decryptAndStore, ws.sendTyping]);
}
