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
  displayName: string;
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
  displayName: string;
  publicKey: string;
  online: boolean;
}

export interface ContactsPayload {
  contacts: UserItem[];
  blocked: UserItem[];
}

export interface UserStatusPayload {
  userId: number;
  username: string;
  displayName: string;
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

export interface AddContactPayload { username: string; }
export interface BlockUserPayload { username: string; }
export interface DeleteChatPayload { username: string; }

export type ClientMessage =
  | { type: "register"; payload: RegisterPayload }
  | { type: "send_message"; payload: SendMessagePayload }
  | { type: "get_history"; payload: GetHistoryPayload }
  | { type: "get_contacts"; payload: Record<string, never> }
  | { type: "add_contact"; payload: AddContactPayload }
  | { type: "remove_contact"; payload: AddContactPayload }
  | { type: "block_user"; payload: BlockUserPayload }
  | { type: "unblock_user"; payload: BlockUserPayload }
  | { type: "delete_chat"; payload: DeleteChatPayload }
  | { type: "typing"; payload: TypingPayload }
  | { type: "request_public_key"; payload: RequestPublicKeyPayload };

export interface DeleteChatServerPayload { with: string; }

export type ServerMessage =
  | { type: "registered"; payload: RegisteredPayload }
  | { type: "message"; payload: MessagePayload }
  | { type: "history"; payload: HistoryPayload }
  | { type: "contacts"; payload: ContactsPayload }
  | { type: "user_status"; payload: UserStatusPayload }
  | { type: "public_key"; payload: PublicKeyPayload }
  | { type: "typing"; payload: TypingServerPayload }
  | { type: "error"; payload: ErrorPayload }
  | { type: "message_ack"; payload: MessageAckPayload }
  | { type: "chat_deleted"; payload: DeleteChatServerPayload };
