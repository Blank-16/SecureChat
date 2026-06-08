import Database from "better-sqlite3";
import path from "path";
import { DbUser, DbMessage, DbSession } from "./types/db";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "chat.db");
const rawTtl = parseInt(process.env.SESSION_TTL_DAYS ?? "30", 10);
const SESSION_TTL_DAYS = Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : 30;

let db: Database.Database;
try {
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
} catch (err) {
  console.error("Failed to open database:", err);
  process.exit(1);
}

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        displayName TEXT NOT NULL DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        nonce TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        contactId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(userId, contactId)
    );

    CREATE TABLE IF NOT EXISTS blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        blockerId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blockedId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(blockerId, blockedId)
    );

    CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        creatorId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS group_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        groupId INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(groupId, userId)
    );

    CREATE TABLE IF NOT EXISTS group_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        groupId INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        senderId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS group_envelopes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        groupMessageId INTEGER NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
        recipientId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ciphertext TEXT NOT NULL,
        UNIQUE(groupMessageId, recipientId)
    );
`);




export type DbError = "ALREADY_EXISTS" | "DATABASE_ERROR" | "NOT_FOUND";

export type DbResult<T> =
  | { success: true; data: T }
  | { success: false; error: DbError };

export function createUser(
  username: string,
  displayName: string,
  publicKey: string,
): DbResult<DbUser> {
  try {
    const user = db
      .prepare<
        [string, string, string],
        DbUser
      >("INSERT INTO users (username, displayName, publicKey) VALUES (?, ?, ?) RETURNING *")
      .get(username, displayName, publicKey);

    if (!user) return { success: false, error: "DATABASE_ERROR" };
    return { success: true, data: user };
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as any).code === "SQLITE_CONSTRAINT_UNIQUE") {
      return { success: false, error: "ALREADY_EXISTS" };
    }
    console.error("createUser error:", err);
    return { success: false, error: "DATABASE_ERROR" };
  }
}

export function getUserById(id: number): DbUser | undefined {
  return db
    .prepare<[number], DbUser>("SELECT * FROM users WHERE id = ?")
    .get(id);
}

export function getUserByUsername(username: string): DbUser | undefined {
  return db
    .prepare<[string], DbUser>("SELECT * FROM users WHERE username = ?")
    .get(username);
}

export function getAllUsers(): DbUser[] {
  return db.prepare<[], DbUser>("SELECT * FROM users ORDER BY username").all();
}

export function createSession(
  userId: number,
  token: string,
): DbResult<DbSession> {
  try {
    const session = db
      .prepare<
        [number, string],
        DbSession
      >("INSERT INTO sessions (userId, token) VALUES (?, ?) RETURNING *")
      .get(userId, token);

    if (!session) return { success: false, error: "DATABASE_ERROR" };
    return { success: true, data: session };
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as any).code === "SQLITE_CONSTRAINT_UNIQUE") {
      return { success: false, error: "ALREADY_EXISTS" };
    }
    console.error("createSession error:", err);
    return { success: false, error: "DATABASE_ERROR" };
  }
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
  db.prepare(`
    DELETE FROM sessions
    WHERE userId = ? AND (strftime('%s', 'now') - strftime('%s', createdAt)) > ?
  `).run(userId, SESSION_TTL_DAYS * 86_400);

  const row = db.prepare<[number], { count: number }>(
    "SELECT COUNT(*) as count FROM sessions WHERE userId = ?"
  ).get(userId);
  return (row?.count ?? 0) > 0;
}

export function purgeExpiredSessions(): void {
  db.prepare(
    "DELETE FROM sessions WHERE (strftime('%s', 'now') - strftime('%s', createdAt)) > ?"
  ).run(SESSION_TTL_DAYS * 86_400);
}

export function saveMessage(
  senderId: number,
  receiverId: number,
  ciphertext: string,
  senderCiphertext: string,
): DbResult<DbMessage> {
  try {
    const message = db
      .prepare<[number, number, string, string], DbMessage>(
        `
        INSERT INTO messages (senderId, receiverId, ciphertext, senderCiphertext)
        VALUES (?, ?, ?, ?)
        RETURNING *
      `,
      )
      .get(senderId, receiverId, ciphertext, senderCiphertext);

    if (!message) return { success: false, error: "DATABASE_ERROR" };
    return { success: true, data: message };
  } catch {
    return { success: false, error: "DATABASE_ERROR" };
  }
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

export function saveChallenge(username: string, nonce: string): void {
  db.prepare<[string, string], void>(`
    INSERT INTO challenges (username, nonce)
    VALUES (?, ?)
    ON CONFLICT(username) DO UPDATE SET nonce = excluded.nonce, createdAt = datetime('now')
  `).run(username, nonce);
}

export function getChallenge(username: string): string | undefined {
  const row = db.prepare<[string], {nonce: string, createdAt: string}>(
    "SELECT nonce, createdAt FROM challenges WHERE username = ?"
  ).get(username);
  
  if (!row) return undefined;
  
  const createdAt = new Date(row.createdAt + "Z").getTime();
  if (Date.now() - createdAt > 5 * 60 * 1000) {
    deleteChallenge(username);
    return undefined;
  }
  
  return row.nonce;
}

export function deleteChallenge(username: string): void {
  db.prepare<[string], void>("DELETE FROM challenges WHERE username = ?").run(username);
}

// --- Contacts & Blocks ---

export function addContact(userId: number, contactId: number): void {
  db.prepare(`
    INSERT INTO contacts (userId, contactId) VALUES (?, ?)
    ON CONFLICT DO NOTHING
  `).run(userId, contactId);
}

export function removeContact(userId: number, contactId: number): void {
  db.prepare("DELETE FROM contacts WHERE userId = ? AND contactId = ?").run(userId, contactId);
}

export function getContactsForUser(userId: number): DbUser[] {
  return db.prepare<[number, number, number, number, number, number], DbUser>(`
    SELECT DISTINCT u.* FROM users u
    LEFT JOIN contacts c ON u.id = c.contactId AND c.userId = ?
    LEFT JOIN messages m ON (u.id = m.senderId AND m.receiverId = ?)
                         OR (u.id = m.receiverId AND m.senderId = ?)
    WHERE u.id != ?
      AND (c.id IS NOT NULL OR m.id IS NOT NULL)
      AND u.id NOT IN (SELECT blockedId FROM blocks WHERE blockerId = ?)
      AND u.id NOT IN (SELECT blockerId FROM blocks WHERE blockedId = ?)
    ORDER BY u.username
  `).all(userId, userId, userId, userId, userId, userId);
}

export function getUsersWhoAdded(contactId: number): DbUser[] {
  return db.prepare<[number, number, number, number, number, number], DbUser>(`
    SELECT DISTINCT u.* FROM users u
    LEFT JOIN contacts c ON u.id = c.userId AND c.contactId = ?
    LEFT JOIN messages m ON (u.id = m.senderId AND m.receiverId = ?)
                         OR (u.id = m.receiverId AND m.senderId = ?)
    WHERE u.id != ?
      AND (c.id IS NOT NULL OR m.id IS NOT NULL)
      AND u.id NOT IN (SELECT blockedId FROM blocks WHERE blockerId = ?)
      AND u.id NOT IN (SELECT blockerId FROM blocks WHERE blockedId = ?)
    ORDER BY u.username
  `).all(contactId, contactId, contactId, contactId, contactId, contactId);
}

export function blockUser(blockerId: number, blockedId: number): void {
  db.prepare(`
    INSERT INTO blocks (blockerId, blockedId) VALUES (?, ?)
    ON CONFLICT DO NOTHING
  `).run(blockerId, blockedId);
  // Remove from contacts if blocked
  db.prepare("DELETE FROM contacts WHERE userId = ? AND contactId = ?").run(blockerId, blockedId);
}

export function unblockUser(blockerId: number, blockedId: number): void {
  db.prepare("DELETE FROM blocks WHERE blockerId = ? AND blockedId = ?").run(blockerId, blockedId);
}

export function isBlocked(blockerId: number, blockedId: number): boolean {
  const row = db.prepare<[number, number], { id: number }>(`
    SELECT id FROM blocks WHERE blockerId = ? AND blockedId = ?
  `).get(blockerId, blockedId);
  return !!row;
}

export function getBlockedUsers(userId: number): DbUser[] {
  return db.prepare<[number], DbUser>(`
    SELECT u.* FROM users u
    JOIN blocks b ON u.id = b.blockedId
    WHERE b.blockerId = ?
  `).all(userId);
}

export function deleteConversation(userAId: number, userBId: number): void {
  db.prepare(`
    DELETE FROM messages
    WHERE (senderId = ? AND receiverId = ?)
  `).run(userAId, userBId, userBId, userAId);
}

export interface DbGroup {
  id: number;
  name: string;
  members: string[];
}

export function createGroup(name: string, creatorId: number, memberUsernames: string[]): DbGroup | null {
  const transaction = db.transaction(() => {
    const grp = db.prepare("INSERT INTO groups (name, creatorId) VALUES (?, ?) RETURNING *")
      .get(name, creatorId) as { id: number, name: string } | undefined;
    if (!grp) return null;

    db.prepare("INSERT INTO group_members (groupId, userId) VALUES (?, ?)").run(grp.id, creatorId);

    const addMember = db.prepare(`
      INSERT INTO group_members (groupId, userId)
      SELECT ?, id FROM users WHERE username = ?
      ON CONFLICT DO NOTHING
    `);
    for (const username of memberUsernames) {
      addMember.run(grp.id, username);
    }
    return grp;
  });

  const grpResult = transaction();
  if (!grpResult) return null;

  const members = db.prepare(`
    SELECT username FROM users u
    JOIN group_members gm ON u.id = gm.userId
    WHERE gm.groupId = ?
  `).all(grpResult.id) as { username: string }[];

  return {
    id: grpResult.id,
    name: grpResult.name,
    members: members.map(m => m.username),
  };
}

export function getGroupsForUser(userId: number): DbGroup[] {
  const grps = db.prepare(`
    SELECT g.id, g.name FROM groups g
    JOIN group_members gm ON g.id = gm.groupId
    WHERE gm.userId = ?
  `).all(userId) as { id: number, name: string }[];

  return grps.map(g => {
    const members = db.prepare(`
      SELECT username FROM users u
      JOIN group_members gm ON u.id = gm.userId
      WHERE gm.groupId = ?
    `).all(g.id) as { username: string }[];

    return {
      id: g.id,
      name: g.name,
      members: members.map(m => m.username),
    };
  });
}

export function saveGroupMessage(groupId: number, senderId: number, envelopes: Record<string, string>): void {
  const transaction = db.transaction(() => {
    const msg = db.prepare("INSERT INTO group_messages (groupId, senderId) VALUES (?, ?) RETURNING id")
      .get(groupId, senderId) as { id: number } | undefined;
    if (!msg) return;

    const saveEnvelope = db.prepare(`
      INSERT INTO group_envelopes (groupMessageId, recipientId, ciphertext)
      SELECT ?, id, ? FROM users WHERE username = ?
    `);
    for (const [username, ciphertext] of Object.entries(envelopes)) {
      saveEnvelope.run(msg.id, ciphertext, username);
    }
  });
  transaction();
}

export function getGroupHistory(groupId: number, userId: number) {
  return db.prepare(`
    SELECT gm.id, u.username as [from], ge.ciphertext, gm.timestamp
    FROM group_messages gm
    JOIN users u ON gm.senderId = u.id
    JOIN group_envelopes ge ON gm.id = ge.groupMessageId
    WHERE gm.groupId = ? AND ge.recipientId = ?
    ORDER BY gm.id ASC
  `).all(groupId, userId) as { id: number, from: string, ciphertext: string, timestamp: string }[];
}

export { db };
