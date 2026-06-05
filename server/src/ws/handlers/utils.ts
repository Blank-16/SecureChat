import { WebSocket } from "ws";
import { ServerMessage } from "../../types/messages";
import { ConnectedUser } from "../../types/db";
import { getUsersWhoAdded } from "../../db";

export const connections = new Map<WebSocket, ConnectedUser>();
export const typingState = new Map<WebSocket, Set<string>>();

export function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch (err) {
    console.error("ws.send error:", err);
  }
}

export function broadcastToSubscribers(targetUserId: number, msg: ServerMessage, exclude?: WebSocket): void {
  const subscriberIds = new Set(getUsersWhoAdded(targetUserId).map(u => u.id));
  for (const [client, user] of connections) {
    if (client !== exclude && subscriberIds.has(user.userId)) {
      send(client, msg);
    }
  }
}

export function findSocketByUserId(userId: number): WebSocket | undefined {
  for (const [ws, user] of connections) {
    if (user.userId === userId) return ws;
  }
  return undefined;
}

export function getOnlineUserIds(): number[] {
  return [...connections.values()].map(u => u.userId);
}
