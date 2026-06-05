import { WebSocket } from "ws";
import { RequestPublicKeyPayload } from "../../types/messages";
import { getUserByUsername } from "../../db";
import { connections, typingState, send, broadcastToSubscribers, findSocketByUserId } from "./utils";

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
