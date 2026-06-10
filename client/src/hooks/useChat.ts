import { useCryptoStore } from "../store/cryptoStore";
import { useCallback, useRef, useEffect } from "react";
import { useEncryption } from "./useEncryption";
import { useWebSocket } from "./useWebSocket";
import { useAuthStore } from "../store/authStore";
import { useChatStore, nextOptimisticId } from "../store/chatStore";

import type { Message } from "../types";
import { cacheMessage, getCachedMessages, clearCache } from "../utils/messageCache";

type KeySet = { identityKey: string; preKey: string; preKeySignature: string };

export function useChat(authenticated: boolean) {
  const { encryptRatchet, decryptRatchet, encryptECIES, decryptECIES, encryptGroupMessage, decryptGroupMessage, ready } = useEncryption();
  const ws = useWebSocket(authenticated && ready);

  const keyCache = useRef<Map<string, KeySet>>(new Map());
  const keyRequests = useRef<Map<string, Array<(keys: KeySet | null) => void>>>(new Map());

  const authState = useAuthStore((s) => s.authState);
  useEffect(() => {
    if (authState === "unauthenticated") {
      void clearCache();
    }
  }, [authState]);

  useEffect(() => {
    ws.setPublicKeyHandler((username, keys) => {
      keyCache.current.set(username, keys);
      const resolvers = keyRequests.current.get(username) ?? [];
      keyRequests.current.delete(username);
      resolvers.forEach(resolve => resolve(keys));
    });
    return () => { ws.setPublicKeyHandler(() => {}); };
  }, [ws]);

  useEffect(() => {
    if (ws.status === "connected") {
      keyCache.current.clear();
    }
  }, [ws.status]);

  const ensurePublicKey = useCallback(async (username: string): Promise<KeySet | null> => {
    if (keyCache.current.has(username)) return keyCache.current.get(username)!;

    return new Promise((resolve) => {
      const existing = keyRequests.current.get(username);
      if (existing) {
        existing.push(resolve);
      } else {
        keyRequests.current.set(username, [resolve]);
        ws.requestPublicKey(username);
      }
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
      const self = useAuthStore.getState().username;
      
      if (peer.startsWith("group:")) {
        const groupId = parseInt(peer.split(":")[1], 10);
        // It's a group message. We need the sender's public Identity Key and the GMK.
        
        // 1. Get GMK
        const groupKeyCache = useChatStore.getState().groupKeys[groupId] || [];
        const keyData = groupKeyCache.find(k => k.keyId === msg.keyId);
        if (!keyData) return; // Wait for keys to arrive
        const gmkB64 = await decryptECIES(keyData.encryptedKey);

        // 2. Get Sender Identity Key
        const senderKeys = await ensurePublicKey(msg.from);
        if (!senderKeys) throw new Error("Missing sender public keys");
        
        plaintext = await decryptGroupMessage(msg.ciphertext, gmkB64, senderKeys.identityKey);

      } else {
        if (msg.from === self) {
          // It's a 1-on-1 message we sent
          if (!msg.senderCiphertext) throw new Error("No sender ciphertext");
          plaintext = await decryptECIES(msg.senderCiphertext);
        } else {
          plaintext = await decryptRatchet(peer, msg.ciphertext);
        }
      }
    } catch (err) {
      console.error("Decrypt error:", err);
      decryptError = true;
    }
    useChatStore.getState().setDecrypted(peer, msg.id, plaintext, decryptError);
    void cacheMessage(peer, { ...msg, plaintext, decryptError });
  }, [decryptRatchet, decryptECIES, decryptGroupMessage, ensurePublicKey]);

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
    const recipientKeys = await ensurePublicKey(to);
    if (!recipientKeys) return false;

    const optimisticId = nextOptimisticId();
    const self = useAuthStore.getState().username;
    if (!self) return false;

    const optimistic: Message = {
      id: optimisticId,
      from: self,
      to,
      ciphertext: "",
      senderCiphertext: "",
      plaintext: text,
      timestamp: new Date().toISOString(),
      sendStatus: "sending",
    };

    useChatStore.getState().append(to, optimistic);

    try {
      const [ciphertext, senderCiphertext] = await Promise.all([
        encryptRatchet(to, text, recipientKeys.identityKey, recipientKeys.preKey, recipientKeys.preKeySignature),
        encryptECIES(text, useAuthStore.getState().username ? useCryptoStore.getState().preKeyPublicB64! : ""),
      ]);
      ws.sendMessage(to, ciphertext, senderCiphertext);
      return true;
    } catch (err) {
      console.error("Encryption failed", err);
      useChatStore.getState().fail(to, optimisticId);
      return false;
    }
  }, [encryptRatchet, encryptECIES, ensurePublicKey, ws]);

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
    ws.requestGroupKeys(groupId);
    ws.requestGroupHistory(groupId);
  }, [ws]);

  const sendGroupMessage = useCallback(async (groupId: number, text: string): Promise<boolean> => {
    const self = useAuthStore.getState().username;
    if (!self) return false;

    const groupKeyCache = useChatStore.getState().groupKeys[groupId] || [];
    if (groupKeyCache.length === 0) {
      console.error("No GMKs available for group", groupId);
      return false;
    }
    
    // Sort by keyId descending to get latest
    const latestKey = [...groupKeyCache].sort((a, b) => b.keyId - a.keyId)[0];
    
    let gmkB64 = "";
    try {
      gmkB64 = await decryptECIES(latestKey.encryptedKey);
    } catch (err) {
      console.error("Failed to decrypt GMK", err);
      return false;
    }

    const optimisticId = nextOptimisticId();
    const groupKey = "group:" + groupId;

    const optimistic: Message = {
      id: optimisticId,
      from: self,
      to: groupKey,
      ciphertext: "",
      senderCiphertext: "",
      plaintext: text,
      timestamp: new Date().toISOString(),
      sendStatus: "sending",
    };

    useChatStore.getState().append(groupKey, optimistic);

    try {
      const ct = await encryptGroupMessage(text, gmkB64);
      ws.sendGroupMessage(groupId, ct, latestKey.keyId);
      
      return true;
    } catch (err) {
      console.error("Group encryption failed", err);
      useChatStore.getState().fail(groupKey, optimisticId);
      return false;
    }
  }, [encryptGroupMessage, decryptECIES, ws]);

  return {
    ...ws,
    selectUser,
    sendMessage,
    loadHistory,
    selectGroup,
    sendGroupMessage,
    ensurePublicKey,
  };
}
