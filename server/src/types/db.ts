export interface DbUser {
  id: number;
  username: string;
  publicKey: string;
  createdAt: string;
}

export interface DbSession {
  id: number;
  userId: number;
  token: string;
  createdAt: string;
}

export interface DbMessage {
  id: number;
  senderId: number;
  receiverId: number;
  ciphertext: string;
  senderCiphertext: string;
  timestamp: string;
}

export interface ConnectedUser {
  userId: number;
  username: string;
}
