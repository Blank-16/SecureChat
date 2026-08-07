import { WebSocket } from "ws";
import { SendMessagePayload, GetHistoryPayload, TypingPayload, DeleteChatPayload } from "../../types/messages";
import { getUserByUsername, saveMessage, getConversation, isBlocked, softDeleteConversation } from "../../db";
import { connections, typingState, send, findSocketsByUserId } from "./utils";

const HISTORY_PAGE_SIZE = 100;
// Saves and forwards an encrypted message to the recipient.
export async function handleSendMessage(
  ws: WebSocket,
  payload: SendMessagePayload,
): Promise<void> {
  const sender = connections.get(ws);
  if (!sender) {
    send(ws, { type: "error", payload: { message: "not registered" } });
    return;
  }

  const receiver = await getUserByUsername(payload.to);
  if (!receiver) {
    send(ws, { type: "error", payload: { message: "recipient not found" } });
    return;
  }

  if (await isBlocked(receiver.id, sender.userId)) {
    send(ws, { type: "error", payload: { message: "recipient unavailable" } });
    return;
  }

  const result = await saveMessage(
    sender.userId,
    receiver.id,
    payload.ciphertext,
    payload.senderCiphertext,
  );

  if (!result.success) {
    send(ws, { type: "error", payload: { message: result.error } });
    return;
  }

  const saved = result.data;

  send(ws, {
    type: "message",
    payload: {
      id: saved.id,
      from: sender.username,
      to: receiver.username,
      ciphertext: saved.senderCiphertext,
      timestamp: saved.timestamp,
    },
  });

  const receiverSockets = findSocketsByUserId(receiver.id);
  for (const s of receiverSockets) {
    send(s, {
      type: "message",
      payload: {
        id: saved.id,
        from: sender.username,
        to: receiver.username,
        ciphertext: saved.ciphertext,
        timestamp: saved.timestamp,
      },
    });
  }

  const senderSockets = findSocketsByUserId(sender.userId);
  for (const s of senderSockets) {
    if (s !== ws) {
      send(s, {
        type: "message",
        payload: {
          id: saved.id,
          from: sender.username,
          to: receiver.username,
          ciphertext: saved.senderCiphertext,
          timestamp: saved.timestamp,
        },
      });
    }
  }
}

// Retrieves and sends a page of conversation history.
// Pass payload.beforeId to page backwards through older messages.
export async function handleGetHistory(
  ws: WebSocket,
  payload: GetHistoryPayload,
): Promise<void> {
  const user = connections.get(ws);
  if (!user) {
    send(ws, { type: "error", payload: { message: "not registered" } });
    return;
  }

  const other = await getUserByUsername(payload.with);
  if (!other) {
    send(ws, { type: "error", payload: { message: "user not found" } });
    return;
  }

  // Fetch one extra row to detect whether an older page exists, without
  // a separate COUNT query.
  const messages = await getConversation(user.userId, other.id, HISTORY_PAGE_SIZE + 1, payload.beforeId);
  const hasMore = messages.length > HISTORY_PAGE_SIZE;
  const page = hasMore ? messages.slice(messages.length - HISTORY_PAGE_SIZE) : messages;

  send(ws, {
    type: "history",
    payload: {
      with: payload.with,
      hasMore,
      messages: page.map((m) => ({
        id: m.id,
        from: m.senderId === user.userId ? user.username : payload.with,
        to: m.receiverId === user.userId ? user.username : payload.with,
        ciphertext: m.senderId === user.userId ? m.senderCiphertext : m.ciphertext,
        timestamp: m.timestamp,
      })),
    },
  });
}

// Updates and forwards typing status to a recipient.
export async function handleTyping(ws: WebSocket, payload: TypingPayload): Promise<void> {
  const sender = connections.get(ws);
  if (!sender) return;

  const receiver = await getUserByUsername(payload.to);
  if (!receiver) return;

  if (payload.isTyping) {
    const active = typingState.get(ws) ?? new Set<string>();
    active.add(payload.to);
    typingState.set(ws, active);
  } else {
    typingState.get(ws)?.delete(payload.to);
  }

  const receiverSockets = findSocketsByUserId(receiver.id);
  for (const s of receiverSockets) {
    send(s, {
      type: "typing",
      payload: {
        from: sender.username,
        isTyping: payload.isTyping,
      },
    });
  }
}

// Soft-deletes the conversation for the requesting user only.
export async function handleDeleteChat(ws: WebSocket, payload: DeleteChatPayload): Promise<void> {
  const sender = connections.get(ws);
  if (!sender) return;

  const receiver = await getUserByUsername(payload.username);
  if (!receiver) return;

  await softDeleteConversation(sender.userId, receiver.id);

  send(ws, {
    type: "chat_deleted",
    payload: { with: receiver.username }
  });
}
