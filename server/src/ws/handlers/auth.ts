import { WebSocket } from "ws";
import { RequestPublicKeyPayload } from "../../types/messages";
import { getUserByUsername } from "../../db";
import { connections, typingState, send, broadcastToSubscribers, findSocketsByUserId } from "./utils";

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
      identityKey: user.identityKey,
      preKey: user.preKey,
      preKeySignature: user.preKeySignature,
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
      const recipientSockets = findSocketsByUserId(recipient.id);
      for (const s of recipientSockets) {
        send(s, {
          type: "typing",
          payload: { from: user.username, isTyping: false },
        });
      }
    }
    typingState.delete(ws);
  }

  connections.delete(ws);

  // If user still has other connected sockets, don't broadcast offline
  const remainingSockets = findSocketsByUserId(user.userId);
  if (remainingSockets.length > 0) return;

  broadcastToSubscribers(user.userId, {
    type: "user_status",
    payload: { userId: user.userId, username: user.username, displayName: user.displayName, online: false },
  });
}
