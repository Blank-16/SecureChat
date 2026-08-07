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

export async function broadcastToSubscribers(targetUserId: number, msg: ServerMessage, exclude?: WebSocket): Promise<void> {
  const subscribers = await getUsersWhoAdded(targetUserId);
  const subscriberIds = new Set(subscribers.map(u => u.id));
  for (const [client, user] of connections) {
    if (client !== exclude && subscriberIds.has(user.userId)) {
      send(client, msg);
    }
  }
}

export function findSocketsByUserId(userId: number): WebSocket[] {
  const sockets: WebSocket[] = [];
  for (const [ws, user] of connections) {
    if (user.userId === userId) sockets.push(ws);
  }
  return sockets;
}

export function getOnlineUserIds(): number[] {
  return [...connections.values()].map(u => u.userId);
}
