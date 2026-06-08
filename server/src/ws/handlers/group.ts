import { WebSocket } from "ws";
import { createGroup, getGroupsForUser, saveGroupMessage, getGroupHistory } from "../../db";
import { connections, send } from "./utils";

export function handleCreateGroup(
  ws: WebSocket,
  payload: { name: string; members: string[] }
): void {
  const user = connections.get(ws);
  if (!user) {
    send(ws, { type: "error", payload: { message: "not registered" } });
    return;
  }

  const grp = createGroup(payload.name, user.userId, payload.members);
  if (!grp) {
    send(ws, { type: "error", payload: { message: "failed to create group" } });
    return;
  }

  for (const [client, conn] of connections.entries()) {
    if (grp.members.includes(conn.username)) {
      send(client, {
        type: "group_created",
        payload: grp,
      });
    }
  }
}

export function handleGetGroups(ws: WebSocket): void {
  const user = connections.get(ws);
  if (!user) {
    send(ws, { type: "error", payload: { message: "not registered" } });
    return;
  }

  const groups = getGroupsForUser(user.userId);
  send(ws, {
    type: "groups",
    payload: { groups },
  });
}

export function handleSendGroupMessage(
  ws: WebSocket,
  payload: { groupId: number; envelopes: Record<string, string> }
): void {
  const sender = connections.get(ws);
  if (!sender) {
    send(ws, { type: "error", payload: { message: "not registered" } });
    return;
  }

  saveGroupMessage(payload.groupId, sender.userId, payload.envelopes);

  for (const [client, conn] of connections.entries()) {
    if (payload.envelopes[conn.username]) {
      send(client, {
        type: "group_message",
        payload: {
          groupId: payload.groupId,
          from: sender.username,
          ciphertext: payload.envelopes[conn.username],
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
}

export function handleGetGroupHistory(
  ws: WebSocket,
  payload: { groupId: number }
): void {
  const user = connections.get(ws);
  if (!user) {
    send(ws, { type: "error", payload: { message: "not registered" } });
    return;
  }

  const messages = getGroupHistory(payload.groupId, user.userId);
  send(ws, {
    type: "group_history",
    payload: {
      groupId: payload.groupId,
      messages: messages.map((m) => ({
        id: m.id,
        from: m.from,
        ciphertext: m.ciphertext,
        timestamp: m.timestamp,
      })),
    },
  });
}
