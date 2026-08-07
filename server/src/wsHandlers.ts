import { IncomingMessage } from "http";
import { WebSocketServer, WebSocket, RawData } from "ws";
import { getSessionTokenFromRequest } from "./cookies";
import { send, connections, broadcastToSubscribers } from "./ws/handlers/utils";
import { getSessionByToken, getUserById, purgeExpiredSessions, purgeFullyDeletedMessages } from "./db";
import { checkRateLimit, clearRateBucket, sweepStaleRateBuckets } from "./ws/rateLimit";
import { ClientMessage } from "./types/messages";
import {
  handleGetHistory,
  handleSendMessage,
  handleTyping,
  handleDeleteChat,
} from "./ws/handlers/chat";
import {
  handleGetContacts,
  handleAddContact,
  handleRemoveContact,
  handleBlockUser,
  handleUnblockUser,
} from "./ws/handlers/contacts";
import { handleRequestPublicKey, handleDisconnect } from "./ws/handlers/auth";
import {
  handleCreateGroup,
  handleGetGroups,
  handleSendGroupMessage,
  handleGetGroupHistory,
  handleAddGroupMember,
  handleRemoveGroupMember,
  handleRotateGroupKey,
  handleGetGroupKeys,
} from "./ws/handlers/group";

interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
}

const HEARTBEAT_INTERVAL = 30_000;
const SESSION_PURGE_INTERVAL = 3_600_000;
const MAX_WS_FRAME_BYTES = 65_536;

export function setupWebSocketServer(wss: WebSocketServer, allowedOrigins: string[]): void {
  const ALLOWED_ORIGINS = new Set(allowedOrigins);

  const purgeInterval = setInterval(() => {
    void purgeExpiredSessions();
    void purgeFullyDeletedMessages();
    sweepStaleRateBuckets();
  }, SESSION_PURGE_INTERVAL);

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as ExtWebSocket;
      if (extWs.isAlive === false) {
        ws.terminate();
        return;
      }
      extWs.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on("close", () => {
    clearInterval(interval);
    clearInterval(purgeInterval);
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    void handleConnection(ws, req, ALLOWED_ORIGINS);
  });
}

async function handleConnection(
  ws: WebSocket,
  req: IncomingMessage,
  allowedOrigins: Set<string>,
): Promise<void> {
  const origin = req.headers.origin ?? "";
  if (!allowedOrigins.has(origin)) {
    ws.close(4001, "origin not allowed");
    return;
  }

  const extWs = ws as ExtWebSocket;
  extWs.isAlive = true;
  ws.on("pong", () => { extWs.isAlive = true; });

  const token = getSessionTokenFromRequest(req);
  if (!token) {
    send(ws, { type: "error", payload: { message: "authentication required" } });
    ws.close(1008, "authentication required");
    return;
  }

  const session = await getSessionByToken(token);
  if (!session) {
    send(ws, { type: "error", payload: { message: "invalid session" } });
    ws.close(1008, "invalid session");
    return;
  }

  const user = await getUserById(session.userId);
  if (!user) {
    send(ws, { type: "error", payload: { message: "user not found" } });
    ws.close(1008, "user not found");
    return;
  }

  connections.set(ws, { userId: user.id, username: user.username, displayName: user.displayName });

  send(ws, {
    type: "registered",
    payload: { userId: user.id, username: user.username, displayName: user.displayName },
  });

  await broadcastToSubscribers(
    user.id,
    { type: "user_status", payload: { userId: user.id, username: user.username, displayName: user.displayName, online: true } },
    ws,
  );

  ws.on("message", (data: RawData) => { void handleMessage(ws, data); });

  ws.on("close", () => {
    void handleDisconnect(ws);
    clearRateBucket(ws);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
}

async function handleMessage(ws: WebSocket, data: RawData): Promise<void> {
  if (!checkRateLimit(ws)) {
    send(ws, { type: "error", payload: { message: "rate limit exceeded" } });
    ws.terminate();
    return;
  }

  // Use Buffer.byteLength, not string .length — multi-byte UTF-8 chars undercount bytes.
  const raw = data.toString();
  if (Buffer.byteLength(raw, "utf8") > MAX_WS_FRAME_BYTES) {
    send(ws, { type: "error", payload: { message: "message too large" } });
    return;
  }

  let parsed: ClientMessage;
  try {
    parsed = JSON.parse(raw) as ClientMessage;
    if (!parsed || typeof parsed !== "object" || !parsed.type) throw new Error("invalid structure");
  } catch {
    send(ws, { type: "error", payload: { message: "invalid message format" } });
    return;
  }

  switch (parsed.type) {
    case "send_message":
      if (parsed.payload?.to && parsed.payload?.ciphertext && parsed.payload?.senderCiphertext)
        await handleSendMessage(ws, parsed.payload);
      break;
    case "get_history":
      if (parsed.payload?.with) await handleGetHistory(ws, parsed.payload);
      break;
    case "get_contacts":
      await handleGetContacts(ws);
      break;
    case "add_contact":
      if (parsed.payload?.username) await handleAddContact(ws, parsed.payload);
      break;
    case "remove_contact":
      if (parsed.payload?.username) await handleRemoveContact(ws, parsed.payload);
      break;
    case "block_user":
      if (parsed.payload?.username) await handleBlockUser(ws, parsed.payload);
      break;
    case "unblock_user":
      if (parsed.payload?.username) await handleUnblockUser(ws, parsed.payload);
      break;
    case "delete_chat":
      if (parsed.payload?.username) await handleDeleteChat(ws, parsed.payload);
      break;
    case "typing":
      if (typeof parsed.payload?.isTyping === "boolean") await handleTyping(ws, parsed.payload);
      break;
    case "request_public_key":
      if (parsed.payload?.username) await handleRequestPublicKey(ws, parsed.payload);
      break;
    case "create_group":
      if (parsed.payload?.name && parsed.payload?.keys) await handleCreateGroup(ws, parsed.payload);
      break;
    case "get_groups":
      await handleGetGroups(ws);
      break;
    case "send_group_message":
      if (parsed.payload?.groupId && parsed.payload?.ciphertext && parsed.payload?.keyId)
        await handleSendGroupMessage(ws, parsed.payload);
      break;
    case "get_group_history":
      if (parsed.payload?.groupId) await handleGetGroupHistory(ws, parsed.payload);
      break;
    case "get_group_keys":
      if (parsed.payload?.groupId) await handleGetGroupKeys(ws, parsed.payload);
      break;
    case "add_group_member":
      if (parsed.payload?.groupId && parsed.payload?.username && parsed.payload?.encryptedKey && parsed.payload?.keyId)
        await handleAddGroupMember(ws, parsed.payload);
      break;
    case "remove_group_member":
      if (parsed.payload?.groupId && parsed.payload?.username)
        await handleRemoveGroupMember(ws, parsed.payload);
      break;
    case "rotate_group_key":
      if (parsed.payload?.groupId && parsed.payload?.keys)
        await handleRotateGroupKey(ws, parsed.payload);
      break;
    default:
      send(ws, { type: "error", payload: { message: "unknown message type" } });
  }
}
