import { WebSocket } from "ws";
import { createGroup, getGroupsForUser, saveGroupMessage, getGroupHistory, addGroupMember, removeGroupMember, rotateGroupKey, getGroupKeysForUser, isGroupMember } from "../../db";
import { connections, send } from "./utils";

export function handleCreateGroup(
  ws: WebSocket,
  payload: { name: string; keys: Record<string, string> }
): void {
  const user = connections.get(ws);
  if (!user) return;

  const grp = createGroup(payload.name, user.userId, payload.keys);
  if (!grp) {
    send(ws, { type: "error", payload: { message: "failed to create group" } });
    return;
  }

  for (const [client, conn] of connections.entries()) {
    if (grp.members.includes(conn.username)) {
      send(client, { type: "group_created", payload: grp });
    }
  }
}

export function handleGetGroups(ws: WebSocket): void {
  const user = connections.get(ws);
  if (!user) return;

  const groups = getGroupsForUser(user.userId);
  send(ws, { type: "groups", payload: { groups } });
}

export function handleSendGroupMessage(
  ws: WebSocket,
  payload: { groupId: number; ciphertext: string; keyId: number }
): void {
  const sender = connections.get(ws);
  if (!sender) return;

  if (!isGroupMember(payload.groupId, sender.userId)) return;

  const msgId = saveGroupMessage(payload.groupId, sender.userId, payload.ciphertext, payload.keyId);
  if (!msgId) return;

  const groups = getGroupsForUser(sender.userId);
  const grp = groups.find(g => g.id === payload.groupId);
  if (!grp) return;

  for (const [client, conn] of connections.entries()) {
    if (grp.members.includes(conn.username)) {
      send(client, {
        type: "group_message",
        payload: {
          id: msgId,
          groupId: payload.groupId,
          from: sender.username,
          ciphertext: payload.ciphertext,
          keyId: payload.keyId,
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
  if (!user) return;
  
  if (!isGroupMember(payload.groupId, user.userId)) return;

  const messages = getGroupHistory(payload.groupId);
  send(ws, {
    type: "group_history",
    payload: {
      groupId: payload.groupId,
      messages: messages.map((m) => ({
        id: m.id,
        from: m.from,
        ciphertext: m.ciphertext,
        keyId: m.keyId,
        timestamp: m.timestamp,
      })),
    },
  });
}

export function handleGetGroupKeys(ws: WebSocket, payload: { groupId: number }): void {
  const user = connections.get(ws);
  if (!user) return;

  if (!isGroupMember(payload.groupId, user.userId)) return;

  const keys = getGroupKeysForUser(payload.groupId, user.userId);
  send(ws, {
    type: "group_keys",
    payload: { groupId: payload.groupId, keys }
  });
}

export function handleAddGroupMember(ws: WebSocket, payload: { groupId: number, username: string, encryptedKey: string, keyId: number }): void {
  const user = connections.get(ws);
  if (!user || !isGroupMember(payload.groupId, user.userId)) return;

  const ok = addGroupMember(payload.groupId, payload.username, payload.encryptedKey, payload.keyId);
  if (ok) {
    const groups = getGroupsForUser(connections.get(ws)!.userId);
    const grp = groups.find(g => g.id === payload.groupId);
    if (grp) {
      for (const [client, conn] of connections.entries()) {
        if (grp.members.includes(conn.username)) {
          send(client, { type: "group_updated", payload: grp });
        }
      }
    }
  }
}

export function handleRemoveGroupMember(ws: WebSocket, payload: { groupId: number, username: string }): void {
  const user = connections.get(ws);
  if (!user || !isGroupMember(payload.groupId, user.userId)) return;

  const ok = removeGroupMember(payload.groupId, payload.username);
  if (ok) {
    const groups = getGroupsForUser(connections.get(ws)!.userId);
    const grp = groups.find(g => g.id === payload.groupId);
    if (grp) {
      for (const [client, conn] of connections.entries()) {
        if (grp.members.includes(conn.username) || conn.username === payload.username) {
          send(client, { type: "group_updated", payload: grp });
        }
      }
    }
  }
}

export function handleRotateGroupKey(ws: WebSocket, payload: { groupId: number, keyId: number, keys: Record<string, string> }): void {
  const user = connections.get(ws);
  if (!user || !isGroupMember(payload.groupId, user.userId)) return;

  const ok = rotateGroupKey(payload.groupId, payload.keyId, payload.keys);
  if (ok) {
    const groups = getGroupsForUser(connections.get(ws)!.userId);
    const grp = groups.find(g => g.id === payload.groupId);
    if (grp) {
      for (const [client, conn] of connections.entries()) {
        if (grp.members.includes(conn.username)) {
          send(client, { type: "group_updated", payload: grp });
        }
      }
    }
  }
}
