import { WebSocket } from "ws";
import { RegisterPayload, RequestPublicKeyPayload } from "../../types/messages";
import { getUserByUsername, createUser } from "../../db";
import { connections, typingState, send, broadcastToSubscribers, findSocketByUserId } from "./utils";

// Handles user registration and notifies others of online status.
export function handleRegister(ws: WebSocket, payload: RegisterPayload): void {
  let user = getUserByUsername(payload.username);
  if (!user) {
    const result = createUser(payload.username, payload.publicKey);
    if (!result.success) {
      send(ws, { type: "error", payload: { message: result.error } });
      return;
    }
    user = result.data;
  } else if (user.publicKey !== payload.publicKey) {
    send(ws, {
      type: "error",
      payload: { message: "username taken or public key mismatch" },
    });
    return;
  }

  connections.set(ws, { userId: user.id, username: user.username });

  send(ws, {
    type: "registered",
    payload: { userId: user.id, username: user.username },
  });

  broadcast(
    {
      type: "user_status",
      payload: { userId: user.id, username: user.username, online: true },
    },
    ws,
  );
}

// Retrieves the public key for a specific user.
export function handleRequestPublicKey(
  ws: WebSocket,
  payload: RequestPublicKeyPayload,
): void {
  const user = getUserByUsername(payload.username);
  if (!user) {
    send(ws, { type: "error", payload: { message: "user not found" } });
    return;
  }

  send(ws, {
    type: "public_key",
    payload: {
      username: user.username,
      publicKey: user.publicKey,
    },
  });
}

// Cleans up user state and notifies others upon disconnection.
export function handleDisconnect(ws: WebSocket): void {
  const user = connections.get(ws);
  if (!user) return;

  const activeTyping = typingState.get(ws);
  if (activeTyping) {
    for (const recipientUsername of activeTyping) {
      const recipient = getUserByUsername(recipientUsername);
      if (!recipient) continue;
      const recipientSocket = findSocketByUserId(recipient.id);
      if (recipientSocket) {
        send(recipientSocket, {
          type: "typing",
          payload: { from: user.username, isTyping: false },
        });
      }
    }
    typingState.delete(ws);
  }

  connections.delete(ws);
  broadcastToSubscribers(user.userId, {
    type: "user_status",
    payload: { userId: user.userId, username: user.username, displayName: user.displayName, online: false },
  });
}
