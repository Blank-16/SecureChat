import { WebSocket } from "ws";
import { getAllUsers } from "../../db";
import { getOnlineUserIds, send } from "./utils";

// Sends a list of all users and their current online status.
export function handleGetUsers(ws: WebSocket): void {
  const onlineIds = getOnlineUserIds();
  const allUsers = getAllUsers().map((u) => ({
    id: u.id,
    username: u.username,
    publicKey: u.publicKey,
    online: onlineIds.includes(u.id),
  }));

  send(ws, {
    type: "users",
    payload: { users: allUsers },
  });
}
