import Database from "better-sqlite3";
import path from "path";
import { DbUser, DbMessage, DbSession } from "./types/db";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "chat.db");
const SESSION_TTL_DAYS = parseInt(process.env.SESSION_TTL_DAYS || "30", 10);

const db = new Database(DB_PATH);

// write ahead logging (to allow stimultaneous read and write
// foreign key constraints
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        publicKey TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        senderId INTEGER NOT NULL REFERENCES users(id),
        receiverId INTEGER NOT NULL REFERENCES users(id),
        ciphertext TEXT NOT NULL,
        senderCiphertext TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages(senderId, receiverId);

    CREATE INDEX IF NOT EXISTS idx_sessions_token
        ON sessions(token);
`);

export function createUser(username: string, publicKey: string): DbUser | null {
  try {
    db.prepare("INSERT INTO users (username, publicKey) VALUES (?, ?)").run(
      username,
      publicKey,
    );
    return db
      .prepare<[string], DbUser>("SELECT * FROM users WHERE username = ?")
      .get(username)!;
  } catch {
    return null;
  }
}

export function getUserById(id: number): DbUser | undefined {
  return db
    .prepare<[number], DbUser>("SELECT * FROM users WHERE id = ?")
    .get(id);
}

export function getAllUsers(): DbUser[] {
  return db.prepare<[], DbUser>("SELECT * FROM users ORDER BY username").all();
}

export function createSession(userId: number, token: string): DbSession {
  db.prepare("INSERT INTO sessions (userId, token) VALUES (? , ?)").run(
    userId,
    token,
  );
  return db
    .prepare<[string], DbSession>("SELECT * FROM sessions WHERE token = ?")
    .get(token)!;
}

export function getSessionByToken(token: string): DbSession | undefined {
  const session = db
    .prepare<[string], DbSession>("SELECT * FROM sessions WHERE token = ?")
    .get(token);

  if (!session) return undefined;

  // check TTL - delete and return undefined if expired

  const createdAt = new Date(session.createdAt + "Z");
  const expiresAt = new Date(
    createdAt.getTime() + SESSION_TTL_DAYS * 86_400_000,
  );

  if (Date.now() > expiresAt.getTime()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return undefined;
  }

  return session;
}

export function deleteSession(token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function hasActiveSession(userId: number): boolean {
  // Purging expired sessions for given user first, then check
  const sessions = db
    .prepare<[number], DbSession>("SELECT * FROM sessions WHERE userId = ?")
    .all(userId);
  const now = Date.now();
  const ttlMs = SESSION_TTL_DAYS * 86_400_400;

  const validSessions = sessions.filter((s) => {
    const createdAt = new Date(s.createdAt + "Z").getTime();
    const expired = now > createdAt + ttlMs;
    if (expired) {
      db.prepare("DELETE FROM sessions token = ?").run(s.token);
    }
    return !expired;
  });

  return validSessions.length > 0;
}

export function saveMessage(
  senderId: number,
  receiverId: number,
  ciphertext: string,
  senderCiphertext: string,
): DbMessage {
  const result = db
    .prepare(
      `
      INSERT INTO messages (senderId, receiverId, ciphertext, senderCiphertext)
      VALUES (?, ?, ?, ?)
    `,
    )
    .run(senderId, receiverId, ciphertext, senderCiphertext);

  return db
    .prepare<[number], DbMessage>("SELECT * FROM messages WHERE id = ?")
    .get(result.lastInsertRowid as number)!;
}

// querying for bi-directional conversation
export function getConversation(
  userAId: number,
  userBId: number,
  limit = 100,
): DbMessage[] {
  return db
    .prepare<[number, number, number, number, number], DbMessage>(
      `
      SELECT * FROM messages
      WHERE (senderId = ? AND receiverId = ?)
         OR (senderId = ? AND receiverId = ?)
      ORDER BY timestamp DESC
      LIMIT ?
    `,
    )
    .all(userAId, userBId, userBId, userAId, limit)
    .reverse();
}
