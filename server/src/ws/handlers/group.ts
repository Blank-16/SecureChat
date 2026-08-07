import { WebSocket } from "ws";
import { createGroup, getGroupsForUser, saveGroupMessage, getGroupHistory, addGroupMember, removeGroupMember, rotateGroupKey, getGroupKeysForUser, isGroupMember, isGroupAdmin } from "../../db";
import { connections, send } from "./utils";

const GROUP_HISTORY_PAGE_SIZE = 200;

export async function handleCreateGroup(
  ws: WebSocket,
  payload: { name: string; keys: Record<string, string> },
): Promise<void> {
  const user = connections.get(ws);
  if (!user) return;

  const grp = await createGroup(payload.name, user.userId, payload.keys);
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

export async function handleGetGroups(ws: WebSocket): Promise<void> {
  const user = connections.get(ws);
  if (!user) return;

  const groups = await getGroupsForUser(user.userId);
  send(ws, { type: "groups", payload: { groups } });
}

export async function handleSendGroupMessage(
  ws: WebSocket,
  payload: { groupId: number; ciphertext: string; keyId: number },
): Promise<void> {
  const sender = connections.get(ws);
  if (!sender) return;

  if (!(await isGroupMember(payload.groupId, sender.userId))) return;

  const msgId = await saveGroupMessage(payload.groupId, sender.userId, payload.ciphertext, payload.keyId);
  if (!msgId) return;

  const groups = await getGroupsForUser(sender.userId);
  const grp = groups.find((g) => g.id === payload.groupId);
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

// Pass payload.beforeId to page backwards through older messages.
export async function handleGetGroupHistory(
  ws: WebSocket,
  payload: { groupId: number; beforeId?: number },
): Promise<void> {
  const user = connections.get(ws);
  if (!user) return;

  if (!(await isGroupMember(payload.groupId, user.userId))) return;

  const messages = await getGroupHistory(payload.groupId, GROUP_HISTORY_PAGE_SIZE + 1, payload.beforeId);
  const hasMore = messages.length > GROUP_HISTORY_PAGE_SIZE;
  const page = hasMore ? messages.slice(messages.length - GROUP_HISTORY_PAGE_SIZE) : messages;

  send(ws, {
    type: "group_history",
    payload: {
      groupId: payload.groupId,
      hasMore,
      messages: page.map((m) => ({
        id: m.id,
        from: m.from,
        ciphertext: m.ciphertext,
        keyId: m.keyId,
        timestamp: m.timestamp,
      })),
    },
  });
}

export async function handleGetGroupKeys(ws: WebSocket, payload: { groupId: number }): Promise<void> {
  const user = connections.get(ws);
  if (!user) return;

  if (!(await isGroupMember(payload.groupId, user.userId))) return;

  const keys = await getGroupKeysForUser(payload.groupId, user.userId);
  send(ws, { type: "group_keys", payload: { groupId: payload.groupId, keys } });
}

// Only admins may add members.
export async function handleAddGroupMember(
  ws: WebSocket,
  payload: { groupId: number; username: string; encryptedKey: string; keyId: number },
): Promise<void> {
  const user = connections.get(ws);
  if (!user) return;

  if (!(await isGroupAdmin(payload.groupId, user.userId))) {
    send(ws, { type: "error", payload: { message: "admin privileges required" } });
    return;
  }

  const ok = await addGroupMember(payload.groupId, payload.username, payload.encryptedKey, payload.keyId);
  if (ok) {
    const groups = await getGroupsForUser(user.userId);
    const grp = groups.find((g) => g.id === payload.groupId);
    if (grp) {
      for (const [client, conn] of connections.entries()) {
        if (grp.members.includes(conn.username)) {
          send(client, { type: "group_updated", payload: grp });
        }
      }
    }
  }
}

// Only admins may remove members.
export async function handleRemoveGroupMember(
  ws: WebSocket,
  payload: { groupId: number; username: string },
): Promise<void> {
  const user = connections.get(ws);
  if (!user) return;

  if (!(await isGroupAdmin(payload.groupId, user.userId))) {
    send(ws, { type: "error", payload: { message: "admin privileges required" } });
    return;
  }

  // Snapshot members before removal so the removed user still receives the notification.
  const groupsBefore = await getGroupsForUser(user.userId);
  const grpBefore = groupsBefore.find((g) => g.id === payload.groupId);

  const result = await removeGroupMember(payload.groupId, payload.username);
  if (!result.success) {
    const message = result.error === "LAST_ADMIN"
      ? "cannot remove the only remaining admin"
      : "member not found in group";
    send(ws, { type: "error", payload: { message } });
    return;
  }

  // Notify all previous members (including the removed user) with the stale list;
  // they will re-fetch groups on next connection/reconnect.
  if (grpBefore) {
    for (const [client, conn] of connections.entries()) {
      if (grpBefore.members.includes(conn.username)) {
        send(client, { type: "group_updated", payload: grpBefore });
      }
    }
  }
}

// Only admins may rotate the group master key.
export async function handleRotateGroupKey(
  ws: WebSocket,
  payload: { groupId: number; keys: Record<string, string> },
): Promise<void> {
  const user = connections.get(ws);
  if (!user) return;

  if (!(await isGroupAdmin(payload.groupId, user.userId))) {
    send(ws, { type: "error", payload: { message: "admin privileges required" } });
    return;
  }

  const result = await rotateGroupKey(payload.groupId, payload.keys);
  if (result.success) {
    const groups = await getGroupsForUser(user.userId);
    const grp = groups.find((g) => g.id === payload.groupId);
    if (grp) {
      for (const [client, conn] of connections.entries()) {
        if (grp.members.includes(conn.username)) {
          send(client, { type: "group_updated", payload: grp });
        }
      }
    }
  } else {
    send(ws, { type: "error", payload: { message: "failed to rotate group key" } });
  }
}
