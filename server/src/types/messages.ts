export interface RegisterPayload {
  username: string;
  publicKey: string;
}

export interface SendMessagePayload {
  to: string;
  ciphertext: string;
  senderCiphertext: string;
}

export interface GetHistoryPayload {
  with: string;
}

export interface TypingPayload {
  to: string;
  isTyping: boolean;
}

export interface RequestPublicKeyPayload {
  username: string;
}

export interface RegisteredPayload {
  userId: number;
  username: string;
}

export interface MessagePayload {
  id: number;
  from: string;
  to: string;
  ciphertext: string;
  timestamp: string;
}

export interface HistoryMessageItem {
  id: number;
  from: string;
  to: string;
  ciphertext: string;
  timestamp: string;
}

export interface HistoryPayload {
  with: string;
  messages: HistoryMessageItem[];
}

export interface UserItem {
  id: number;
  username: string;
  publicKey: string;
  online: boolean;
}

export interface UsersPayload {
  users: UserItem[];
}

export interface UserStatusPayload {
  userId: number;
  username: string;
  online: boolean;
}

export interface PublicKeyPayload {
  username: string;
  publicKey: string;
}

export interface TypingServerPayload {
  from: string;
  isTyping: boolean;
}

export interface ErrorPayload {
  message: string;
}

export interface MessageAckPayload {
  id: number;
}

export type ClientMessage =
  | { type: "register"; payload: RegisterPayload }
  | { type: "send_message"; payload: SendMessagePayload }
  | { type: "get_history"; payload: GetHistoryPayload }
  | { type: "get_users"; payload: Record<string, never> }
  | { type: "typing"; payload: TypingPayload }
  | { type: "request_public_key"; payload: RequestPublicKeyPayload };

export type ServerMessage =
  | { type: "registered"; payload: RegisteredPayload }
  | { type: "message"; payload: MessagePayload }
  | { type: "history"; payload: HistoryPayload }
  | { type: "users"; payload: UsersPayload }
  | { type: "user_status"; payload: UserStatusPayload }
  | { type: "public_key"; payload: PublicKeyPayload }
  | { type: "typing"; payload: TypingServerPayload }
  | { type: "error"; payload: ErrorPayload }
  | { type: "message_ack"; payload: MessageAckPayload };
