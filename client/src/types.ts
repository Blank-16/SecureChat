export interface User {
  id: number;
  username: string;
  displayName: string;
  publicKey: string;
  online: boolean;
}

export interface Message {
  id: number;
  from: string;
  to: string;
  ciphertext: string;
  plaintext?: string;
  timestamp: string;
  decryptError?: boolean;
  sendStatus?: SendStatus;
}

export type SendStatus = "sending" | "send" | "failed";
export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";
export type AuthState = "checking" | "unauthenticated" | "authenticated";

export interface ServerEnvelope {
  type: string;
  payload: Record<string, unknown>;
}
