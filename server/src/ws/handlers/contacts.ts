import { WebSocket } from "ws";
import { getContactsForUser, getBlockedUsers, getUserByUsername, addContact, removeContact, blockUser, unblockUser } from "../../db";
import { getOnlineUserIds, send, connections } from "./utils";
import { AddContactPayload, BlockUserPayload } from "../../types/messages";

export async function handleGetContacts(ws: WebSocket): Promise<void> {
  const conn = connections.get(ws);
  if (!conn) return;

  const onlineIds = getOnlineUserIds();
  const [contactsRaw, blockedRaw] = await Promise.all([
    getContactsForUser(conn.userId),
    getBlockedUsers(conn.userId),
  ]);

  const contacts = contactsRaw.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    identityKey: u.identityKey,
    preKey: u.preKey,
    preKeySignature: u.preKeySignature,
    online: onlineIds.includes(u.id),
  }));

  const blocked = blockedRaw.map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    identityKey: u.identityKey,
    preKey: u.preKey,
    preKeySignature: u.preKeySignature,
    online: false,
  }));

  send(ws, {
    type: "contacts",
    payload: { contacts, blocked },
  });
}

export async function handleAddContact(ws: WebSocket, payload: AddContactPayload): Promise<void> {
  const conn = connections.get(ws);
  if (!conn) return;

  const userToAdd = await getUserByUsername(payload.username);
  if (!userToAdd || userToAdd.id === conn.userId) return;

  await addContact(conn.userId, userToAdd.id);
  await handleGetContacts(ws);
}

export async function handleRemoveContact(ws: WebSocket, payload: AddContactPayload): Promise<void> {
  const conn = connections.get(ws);
  if (!conn) return;

  const userToRemove = await getUserByUsername(payload.username);
  if (!userToRemove) return;

  await removeContact(conn.userId, userToRemove.id);
  await handleGetContacts(ws);
}

export async function handleBlockUser(ws: WebSocket, payload: BlockUserPayload): Promise<void> {
  const conn = connections.get(ws);
  if (!conn) return;

  const userToBlock = await getUserByUsername(payload.username);
  if (!userToBlock) return;

  await blockUser(conn.userId, userToBlock.id);
  await handleGetContacts(ws);
}

export async function handleUnblockUser(ws: WebSocket, payload: BlockUserPayload): Promise<void> {
  const conn = connections.get(ws);
  if (!conn) return;

  const userToUnblock = await getUserByUsername(payload.username);
  if (!userToUnblock) return;

  await unblockUser(conn.userId, userToUnblock.id);
  await handleGetContacts(ws);
}
