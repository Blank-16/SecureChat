import { WebSocket } from "ws";
import { ServerMessage } from "../../types/messages";
import { ConnectedUser } from "../../types/db";

// Active socket connections mapped to user data
export const connections = new Map<WebSocket, ConnectedUser>();

// Tracks which recipients a user is currently typing to
export const typingState = new Map<WebSocket, Set<string>>();

// Sends a JSON message to a specific WebSocket client.
export function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// Broadcasts a message to all connected clients except the excluded one.
export function broadcast(msg: ServerMessage, exclude?: WebSocket): void {
  for (const [client] of connections) {
    if (client !== exclude) send(client, msg);
  }
}

// Finds the WebSocket instance for a specific user ID.
export function findSocketByUserId(userId: number): WebSocket | undefined {
  for (const [ws, user] of connections) {
    if (user.userId === userId) return ws;
  }
  return undefined;
}

// Returns a list of user IDs for all currently connected users.
export function getOnlineUserIds(): number[] {
  return [...connections.values()].map((u) => u.userId);
}
