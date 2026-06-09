export interface RegisterPayload {
  username: string;
  identityKey: string;
  preKey: string;
  preKeySignature: string;
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
  identityKey: string;
  preKey: string;
  preKeySignature: string;
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
  identityKey: string;
  preKey: string;
  preKeySignature: string;
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

export interface DeleteChatServerPayload { with: string; }

export interface CreateGroupPayload {
  name: string;
  keys: Record<string, string>;
}

export interface SendGroupMessagePayload {
  groupId: number;
  ciphertext: string;
  keyId: number;
}

export interface GetGroupHistoryPayload {
  groupId: number;
}

export interface GroupCreatedPayload {
  id: number;
  name: string;
  members: string[];
}

export interface GroupsPayload {
  groups: Array<{
    id: number;
    name: string;
    members: string[];
  }>;
}

export interface GroupMessagePayload {
  id: number;
  groupId: number;
  from: string;
  ciphertext: string;
  keyId: number;
  timestamp: string;
}

export interface GroupHistoryItem {
  id: number;
  from: string;
  ciphertext: string;
  keyId: number;
  timestamp: string;
}

export interface GroupHistoryPayload {
  groupId: number;
  messages: GroupHistoryItem[];
}

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
  | { type: "request_public_key"; payload: RequestPublicKeyPayload }
  | { type: "create_group"; payload: CreateGroupPayload }
  | { type: "get_groups"; payload: Record<string, never> }
  | { type: "send_group_message"; payload: SendGroupMessagePayload }
  | { type: "get_group_history"; payload: GetGroupHistoryPayload }
  | { type: "get_group_keys"; payload: { groupId: number } }
  | { type: "add_group_member"; payload: { groupId: number, username: string, encryptedKey: string, keyId: number } }
  | { type: "remove_group_member"; payload: { groupId: number, username: string } }
  | { type: "rotate_group_key"; payload: { groupId: number, keyId: number, keys: Record<string, string> } };

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
  | { type: "chat_deleted"; payload: DeleteChatServerPayload }
  | { type: "group_created"; payload: GroupCreatedPayload }
  | { type: "groups"; payload: GroupsPayload }
  | { type: "group_message"; payload: GroupMessagePayload }
  | { type: "group_history"; payload: GroupHistoryPayload }
  | { type: "group_updated"; payload: GroupCreatedPayload }
  | { type: "group_keys"; payload: { groupId: number, keys: Array<{ keyId: number, encryptedKey: string }> } };
