import { WebSocket } from "ws";
import { getContactsForUser, getBlockedUsers, getUserByUsername, addContact, removeContact, blockUser, unblockUser } from "../../db";
import { getOnlineUserIds, send, connections } from "./utils";
import { AddContactPayload, BlockUserPayload } from "../../types/messages";

export function handleGetContacts(ws: WebSocket): void {
  const conn = connections.get(ws);
  if (!conn) return;

  const onlineIds = getOnlineUserIds();
  const contacts = getContactsForUser(conn.userId).map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    identityKey: u.identityKey,
    preKey: u.preKey,
    preKeySignature: u.preKeySignature,
    online: onlineIds.includes(u.id),
  }));

  const blocked = getBlockedUsers(conn.userId).map((u) => ({
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

export function handleAddContact(ws: WebSocket, payload: AddContactPayload): void {
  const conn = connections.get(ws);
  if (!conn) return;

  const userToAdd = getUserByUsername(payload.username);
  if (!userToAdd || userToAdd.id === conn.userId) return;

  addContact(conn.userId, userToAdd.id);
  handleGetContacts(ws);
}

export function handleRemoveContact(ws: WebSocket, payload: AddContactPayload): void {
  const conn = connections.get(ws);
  if (!conn) return;

  const userToRemove = getUserByUsername(payload.username);
  if (!userToRemove) return;

  removeContact(conn.userId, userToRemove.id);
  handleGetContacts(ws);
}

export function handleBlockUser(ws: WebSocket, payload: BlockUserPayload): void {
  const conn = connections.get(ws);
  if (!conn) return;

  const userToBlock = getUserByUsername(payload.username);
  if (!userToBlock) return;

  blockUser(conn.userId, userToBlock.id);
  handleGetContacts(ws);
}

export function handleUnblockUser(ws: WebSocket, payload: BlockUserPayload): void {
  const conn = connections.get(ws);
  if (!conn) return;

  const userToUnblock = getUserByUsername(payload.username);
  if (!userToUnblock) return;

  unblockUser(conn.userId, userToUnblock.id);
  handleGetContacts(ws);
}
