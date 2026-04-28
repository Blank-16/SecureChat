export interface DbUser {
  id: number;
  username: string;
  publickey: string;
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
  timeStamp: string;
}

export interface ConnectedUser {
  userId: number;
  username: string;
}
