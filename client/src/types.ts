export interface User {
  id: number;
  username: string;
  displayName: string;
  identityKey: string;
  preKey: string;
  preKeySignature: string;
  online: boolean;
}

export interface Message {
  id: number;
  from: string;
  to: string;
  ciphertext: string;
  senderCiphertext?: string;
  plaintext?: string;
  timestamp: string;
  decryptError?: boolean;
  sendStatus?: SendStatus;
  keyId?: number;
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

export interface Group {
  id: number;
  name: string;
  members: string[];
}

export interface GroupMessage {
  id: number;
  groupId: number;
  from: string;
  ciphertext: string;
  keyId: number;
  plaintext?: string;
  timestamp: string;
  decryptError?: boolean;
}

