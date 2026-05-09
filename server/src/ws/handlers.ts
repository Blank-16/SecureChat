import { WebSocket } from "ws";
import { ClientMessage } from "../types/messages";
import { send } from "./handlers/utils";
import { handleRegister, handleRequestPublicKey, handleDisconnect } from "./handlers/auth";
import { handleSendMessage, handleGetHistory, handleTyping } from "./handlers/chat";
import { handleGetUsers } from "./handlers/users";

export { handleDisconnect };

// Parses and routes incoming WebSocket messages to specific handlers.
export function handleMessage(ws: WebSocket, data: string): void {
  try {
    const msg = JSON.parse(data) as ClientMessage;

    switch (msg.type) {
      case "register":
        handleRegister(ws, msg.payload);
        break;
      case "send_message":
        handleSendMessage(ws, msg.payload);
        break;
      case "get_history":
        handleGetHistory(ws, msg.payload);
        break;
      case "get_users":
        handleGetUsers(ws);
        break;
      case "typing":
        handleTyping(ws, msg.payload);
        break;
      case "request_public_key":
        handleRequestPublicKey(ws, msg.payload);
        break;
      default:
        console.warn("Unknown message type:", (msg as any).type);
    }
  } catch (err) {
    console.error("Failed to parse message:", err);
    send(ws, { type: "error", payload: { message: "invalid message format" } });
  }
}
