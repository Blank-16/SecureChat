import { WebSocket } from "ws";
import { SendMessagePayload, GetHistoryPayload, TypingPayload, DeleteChatPayload } from "../../types/messages";
import { getUserByUsername, saveMessage, getConversation, isBlocked, deleteConversation } from "../../db";
import { connections, typingState, send, findSocketByUserId } from "./utils";

// Saves and forwards an encrypted message to the recipient.
export function handleSendMessage(
  ws: WebSocket,
  payload: SendMessagePayload,
): void {
  const sender = connections.get(ws);
  if (!sender) {
    send(ws, { type: "error", payload: { message: "not registered" } });
    return;
  }

  const receiver = getUserByUsername(payload.to);
  if (!receiver) {
    send(ws, { type: "error", payload: { message: "recipient not found " } });
    return;
  }

  if (isBlocked(receiver.id, sender.userId)) {
    send(ws, { type: "error", payload: { message: "recipient unavailable" } });
    return;
  }

  const result = saveMessage(
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

  // Acknowledge receipt to sender
  send(ws, {
    type: "message_ack",
    payload: { id: saved.id },
  });

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

  const receiverWs = findSocketByUserId(receiver.id);
  if (receiverWs) {
    send(receiverWs, {
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
}

// Retrieves and sends conversation history between two users.
export function handleGetHistory(
  ws: WebSocket,
  payload: GetHistoryPayload,
): void {
  const user = connections.get(ws);
  if (!user) {
    send(ws, { type: "error", payload: { message: "not registered" } });
    return;
  }

  const other = getUserByUsername(payload.with);
  if (!other) {
    send(ws, { type: "error", payload: { message: "user not found" } });
    return;
  }

  const messages = getConversation(user.userId, other.id);

  send(ws, {
    type: "history",
    payload: {
      with: payload.with,
      messages: messages.map((m) => ({
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
export function handleTyping(ws: WebSocket, payload: TypingPayload): void {
  const sender = connections.get(ws);
  if (!sender) return;

  const receiver = getUserByUsername(payload.to);
  if (!receiver) return;

  if (payload.isTyping) {
    const active = typingState.get(ws) ?? new Set<string>();
    active.add(payload.to);
    typingState.set(ws, active);
  } else {
    typingState.get(ws)?.delete(payload.to);
  }

  const receiverWs = findSocketByUserId(receiver.id);
  if (receiverWs) {
    send(receiverWs, {
      type: "typing",
      payload: {
        from: sender.username,
        isTyping: payload.isTyping,
      },
    });
  }
}

export function handleDeleteChat(ws: WebSocket, payload: DeleteChatPayload): void {
  const sender = connections.get(ws);
  if (!sender) return;

  const receiver = getUserByUsername(payload.username);
  if (!receiver) return;

  deleteConversation(sender.userId, receiver.id);

  send(ws, {
    type: "chat_deleted",
    payload: { with: receiver.username }
  });

  const receiverWs = findSocketByUserId(receiver.id);
  if (receiverWs) {
    send(receiverWs, {
      type: "chat_deleted",
      payload: { with: sender.username }
    });
  }
}
