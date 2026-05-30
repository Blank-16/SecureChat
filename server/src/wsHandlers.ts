import { IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { getSessionTokenFromRequest } from "./cookies";
import { send, connections, broadcast, broadcastToSubscribers } from "./ws/handlers/utils";
import { getSessionByToken, getUserById, purgeExpiredSessions } from "./db";
import { checkRateLimit, clearRateBucket } from "./ws/rateLimit";
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
  handleUnblockUser
} from "./ws/handlers/contacts";
import { handleRequestPublicKey } from "./ws/handlers/auth";
import { handleDisconnect } from "./ws/handlers";

// Extension of WebSocket to track liveness
interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
}

const HEARTBEAT_INTERVAL = 30000;
const SESSION_PURGE_INTERVAL = 3600000; // 1 hour

export function setupWebSocketServer(wss: WebSocketServer): void {
  // Periodically purge expired sessions from DB
  setInterval(() => {
    purgeExpiredSessions();
  }, SESSION_PURGE_INTERVAL);

  // Heartbeat interval to detect ghost connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as ExtWebSocket;
      if (extWs.isAlive === false) {
        console.log("Terminating ghost connection");
        return ws.terminate();
      }
      extWs.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on("close", () => {
    clearInterval(interval);
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const extWs = ws as ExtWebSocket;
    extWs.isAlive = true;

    ws.on("pong", () => {
      extWs.isAlive = true;
    });

    const token = getSessionTokenFromRequest(req);
    if (!token) {
      send(ws, {
        type: "error",
        payload: { message: "authentication required" },
      });
      ws.close(1008, "authentication required");
      return;
    }

    const session = getSessionByToken(token);
    if (!session) {
      send(ws, {
        type: "error",
        payload: { message: "invalid session" },
      });
      ws.close(1008, "invalid session");
      return;
    }

    const user = getUserById(session.userId);
    if (!user) {
      send(ws, {
        type: "error",
        payload: { message: "user not found" },
      });
      ws.close(1008, "user not found");
      return;
    }

    // Register connection
    connections.set(ws, { userId: user.id, username: user.username });

    // Notify user of successful registration
    send(ws, {
      type: "registered",
      payload: { userId: user.id, username: user.username },
    });

    // Broadcast user status to mutuals
    broadcastToSubscribers(
      user.id,
      {
        type: "user_status",
        payload: { userId: user.id, username: user.username, displayName: user.displayName, online: true },
      },
      ws,
    );

    ws.on("message", (data) => {
      if (!checkRateLimit(ws)) {
        send(ws, {
          type: "error",
          payload: { message: "rate limit exceeded" },
        });
        ws.close(1008, "rate limit exceeded");
        return;
      }

      let parsed: ClientMessage;
      try {
        parsed = JSON.parse(data.toString()) as ClientMessage;
        // Basic payload validation
        if (!parsed || typeof parsed !== "object" || !parsed.type) {
          throw new Error("Invalid structure");
        }
      } catch {
        send(ws, {
          type: "error",
          payload: { message: "invalid message format" },
        });
        return;
      }

      switch (parsed.type) {
        case "send_message":
          if (parsed.payload?.to && parsed.payload?.ciphertext) {
            handleSendMessage(ws, parsed.payload);
          }
          break;
        case "get_history":
          if (parsed.payload?.with) {
            handleGetHistory(ws, parsed.payload);
          }
          break;
        case "get_contacts":
          handleGetContacts(ws);
          break;
        case "add_contact":
          if (parsed.payload?.username) {
            handleAddContact(ws, parsed.payload);
          }
          break;
        case "remove_contact":
          if (parsed.payload?.username) {
            handleRemoveContact(ws, parsed.payload);
          }
          break;
        case "block_user":
          if (parsed.payload?.username) {
            handleBlockUser(ws, parsed.payload);
          }
          break;
        case "unblock_user":
          if (parsed.payload?.username) {
            handleUnblockUser(ws, parsed.payload);
          }
          break;
        case "delete_chat":
          if (parsed.payload?.username) {
            handleDeleteChat(ws, parsed.payload);
          }
          break;
        case "typing":
          if (typeof parsed.payload?.isTyping === "boolean") {
            handleTyping(ws, parsed.payload);
          }
          break;
        case "request_public_key":
          if (parsed.payload?.username) {
            handleRequestPublicKey(ws, parsed.payload);
          }
          break;
        default:
          send(ws, {
            type: "error",
            payload: { message: "unknown message type" },
          });
      }
    });

    ws.on("close", () => {
      handleDisconnect(ws);
      clearRateBucket(ws);
    });

    ws.on("error", (err) => {
      console.error("WebSocket error: ", err.message);
      handleDisconnect(ws);
      clearRateBucket(ws);
    });
  });
}
