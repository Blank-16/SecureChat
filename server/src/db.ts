import postgres from "postgres";
import { createHash } from "crypto";

let _sql: postgres.Sql | null = null;

export function initDb(databaseUrl: string): postgres.Sql {
  if (_sql) return _sql;
  _sql = postgres(databaseUrl, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
  });
  return _sql;
}

export function sql(strings: TemplateStringsArray, ...values: readonly postgres.ParameterOrFragment<never>[]) {
  if (!_sql) {
    throw new Error("Database not initialized — call initDb() before using db functions");
  }
  return _sql(strings, ...values);
}

// Re-exposes the postgres.js client for operations that are not tagged-template calls (e.g. transactions).
export function getSqlClient(): postgres.Sql {
  if (!_sql) {
    throw new Error("Database not initialized — call initDb() before using db functions");
  }
  return _sql;
}

export async function migrate(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id          BIGSERIAL PRIMARY KEY,
      username    TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      identity_key TEXT NOT NULL,
      pre_key      TEXT NOT NULL,
      pre_key_signature TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id          BIGSERIAL PRIMARY KEY,
      user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  TEXT UNIQUE NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)`;

  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id                  BIGSERIAL PRIMARY KEY,
      sender_id           BIGINT NOT NULL REFERENCES users(id),
      receiver_id         BIGINT NOT NULL REFERENCES users(id),
      ciphertext          TEXT NOT NULL,
      sender_ciphertext   TEXT NOT NULL,
      deleted_by_sender   BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_by_receiver BOOLEAN NOT NULL DEFAULT FALSE,
      timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(sender_id, receiver_id, id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS challenges (
      id         BIGSERIAL PRIMARY KEY,
      username   TEXT UNIQUE NOT NULL,
      nonce      TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS contacts (
      id         BIGSERIAL PRIMARY KEY,
      user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, contact_id)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS blocks (
      id         BIGSERIAL PRIMARY KEY,
      blocker_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(blocker_id, blocked_id)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_blocks_blocker_blocked
      ON blocks(blocker_id, blocked_id)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS groups (
      id         BIGSERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS group_members (
      id         BIGSERIAL PRIMARY KEY,
      group_id   BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role       TEXT NOT NULL DEFAULT 'member',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(group_id, user_id)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS group_messages (
      id         BIGSERIAL PRIMARY KEY,
      group_id   BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      sender_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ciphertext TEXT NOT NULL,
      key_id     BIGINT NOT NULL,
      timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON group_messages(group_id, id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS group_keys (
      id            BIGSERIAL PRIMARY KEY,
      group_id      BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key_id        BIGINT NOT NULL,
      encrypted_key TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(group_id, user_id, key_id)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_group_keys_group_user ON group_keys(group_id, user_id)`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type DbError = "ALREADY_EXISTS" | "DATABASE_ERROR" | "NOT_FOUND";
export type DbResult<T> =
  | { success: true; data: T }
  | { success: false; error: DbError };

export interface DbUser {
  id: number;
  username: string;
  displayName: string;
  identityKey: string;
  preKey: string;
  preKeySignature: string;
  createdAt: string;
}

export interface DbSession {
  id: number;
  userId: number;
  tokenHash: string;
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
  displayName: string;
}

function rowToUser(r: Record<string, unknown>): DbUser {
  return {
    id: r.id as number,
    username: r.username as string,
    displayName: r.display_name as string,
    identityKey: r.identity_key as string,
    preKey: r.pre_key as string,
    preKeySignature: r.pre_key_signature as string,
    createdAt: String(r.created_at),
  };
}

function rowToMessage(r: Record<string, unknown>): DbMessage {
  return {
    id: r.id as number,
    senderId: r.sender_id as number,
    receiverId: r.receiver_id as number,
    ciphertext: r.ciphertext as string,
    senderCiphertext: r.sender_ciphertext as string,
    timestamp: String(r.timestamp),
  };
}

export async function createUser(
  username: string,
  displayName: string,
  identityKey: string,
  preKey: string,
  preKeySignature: string,
): Promise<DbResult<DbUser>> {
  try {
    const [row] = await sql`
      INSERT INTO users (username, display_name, identity_key, pre_key, pre_key_signature)
      VALUES (${username}, ${displayName}, ${identityKey}, ${preKey}, ${preKeySignature})
      RETURNING *
    `;
    if (!row) return { success: false, error: "DATABASE_ERROR" };
    return { success: true, data: rowToUser(row) };
  } catch (err: unknown) {
    // postgres.js surfaces PG constraint violations with code '23505'.
    if (err instanceof Error && (err as { code?: string }).code === "23505") {
      return { success: false, error: "ALREADY_EXISTS" };
    }
    console.error("createUser error:", err);
    return { success: false, error: "DATABASE_ERROR" };
  }
}

export async function getUserById(id: number): Promise<DbUser | undefined> {
  const [row] = await sql`SELECT * FROM users WHERE id = ${id}`;
  return row ? rowToUser(row) : undefined;
}

export async function getUserByUsername(username: string): Promise<DbUser | undefined> {
  const [row] = await sql`SELECT * FROM users WHERE username = ${username}`;
  return row ? rowToUser(row) : undefined;
}

export async function createSession(
  userId: number,
  rawToken: string,
): Promise<DbResult<DbSession>> {
  try {
    const tokenHash = hashToken(rawToken);
    const [row] = await sql`
      INSERT INTO sessions (user_id, token_hash)
      VALUES (${userId}, ${tokenHash})
      RETURNING *
    `;
    if (!row) return { success: false, error: "DATABASE_ERROR" };
    return {
      success: true,
      data: {
        id: row.id as number,
        userId: row.user_id as number,
        tokenHash: row.token_hash as string,
        createdAt: String(row.created_at),
      },
    };
  } catch (err) {
    console.error("createSession error:", err);
    return { success: false, error: "DATABASE_ERROR" };
  }
}

export async function getSessionByToken(rawToken: string): Promise<DbSession | undefined> {
  const tokenHash = hashToken(rawToken);
  const rawTtl = parseInt(process.env.SESSION_TTL_DAYS ?? "30", 10);
  const ttlDays = Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : 30;

  const [row] = await sql`
    SELECT * FROM sessions
    WHERE token_hash = ${tokenHash}
      AND created_at > NOW() - INTERVAL '1 day' * ${ttlDays}
  `;
  return row
    ? { id: row.id as number, userId: row.user_id as number, tokenHash: row.token_hash as string, createdAt: String(row.created_at) }
    : undefined;
}

export async function deleteSession(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
}

export async function purgeExpiredSessions(): Promise<void> {
  const rawTtl = parseInt(process.env.SESSION_TTL_DAYS ?? "30", 10);
  const ttlDays = Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : 30;
  await sql`
    DELETE FROM sessions
    WHERE created_at < NOW() - INTERVAL '1 day' * ${ttlDays}
  `;
}

export async function saveMessage(
  senderId: number,
  receiverId: number,
  ciphertext: string,
  senderCiphertext: string,
): Promise<DbResult<DbMessage>> {
  try {
    const [row] = await sql`
      INSERT INTO messages (sender_id, receiver_id, ciphertext, sender_ciphertext)
      VALUES (${senderId}, ${receiverId}, ${ciphertext}, ${senderCiphertext})
      RETURNING *
    `;
    if (!row) return { success: false, error: "DATABASE_ERROR" };
    return { success: true, data: rowToMessage(row) };
  } catch (err) {
    console.error("saveMessage error:", err);
    return { success: false, error: "DATABASE_ERROR" };
  }
}

export async function getConversation(
  userAId: number,
  userBId: number,
  limit = 100,
  beforeId?: number,
): Promise<DbMessage[]> {
  const rows = beforeId != null
    ? await sql`
        SELECT * FROM messages
        WHERE ((sender_id = ${userAId} AND receiver_id = ${userBId})
            OR (sender_id = ${userBId} AND receiver_id = ${userAId}))
          AND id < ${beforeId}
          AND NOT (sender_id = ${userAId} AND deleted_by_sender = TRUE)
          AND NOT (sender_id = ${userBId} AND deleted_by_receiver = TRUE)
        ORDER BY id DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT * FROM messages
        WHERE ((sender_id = ${userAId} AND receiver_id = ${userBId})
            OR (sender_id = ${userBId} AND receiver_id = ${userAId}))
          AND NOT (sender_id = ${userAId} AND deleted_by_sender = TRUE)
          AND NOT (sender_id = ${userBId} AND deleted_by_receiver = TRUE)
        ORDER BY id DESC
        LIMIT ${limit}
      `;
  return rows.map(rowToMessage).reverse();
}

export async function softDeleteConversation(
  requestingUserId: number,
  otherUserId: number,
): Promise<void> {
  await sql`
    UPDATE messages
    SET deleted_by_sender = CASE
          WHEN sender_id = ${requestingUserId} THEN TRUE
          ELSE deleted_by_sender
        END,
        deleted_by_receiver = CASE
          WHEN receiver_id = ${requestingUserId} THEN TRUE
          ELSE deleted_by_receiver
        END
    WHERE (sender_id = ${requestingUserId} AND receiver_id = ${otherUserId})
       OR (sender_id = ${otherUserId} AND receiver_id = ${requestingUserId})
  `;
}

export async function purgeFullyDeletedMessages(): Promise<void> {
  await sql`
    DELETE FROM messages
    WHERE deleted_by_sender = TRUE AND deleted_by_receiver = TRUE
  `;
}

export async function saveChallenge(username: string, nonce: string): Promise<void> {
  await sql`
    INSERT INTO challenges (username, nonce)
    VALUES (${username}, ${nonce})
    ON CONFLICT (username) DO UPDATE SET nonce = EXCLUDED.nonce, created_at = NOW()
  `;
}

export async function getChallenge(username: string): Promise<string | undefined> {
  const [row] = await sql`
    SELECT nonce, created_at FROM challenges
    WHERE username = ${username}
      AND created_at > NOW() - INTERVAL '5 minutes'
  `;
  return row?.nonce as string | undefined;
}

export async function deleteChallenge(username: string): Promise<void> {
  await sql`DELETE FROM challenges WHERE username = ${username}`;
}

export async function addContact(userId: number, contactId: number): Promise<void> {
  await sql`
    INSERT INTO contacts (user_id, contact_id)
    VALUES (${userId}, ${contactId})
    ON CONFLICT DO NOTHING
  `;
}

export async function removeContact(userId: number, contactId: number): Promise<void> {
  await sql`DELETE FROM contacts WHERE user_id = ${userId} AND contact_id = ${contactId}`;
}

export async function getContactsForUser(userId: number): Promise<DbUser[]> {
  const rows = await sql`
    SELECT DISTINCT u.* FROM users u
    LEFT JOIN contacts c ON u.id = c.contact_id AND c.user_id = ${userId}
    LEFT JOIN messages m ON (u.id = m.sender_id AND m.receiver_id = ${userId})
                         OR (u.id = m.receiver_id AND m.sender_id = ${userId})
    WHERE u.id != ${userId}
      AND (c.id IS NOT NULL OR m.id IS NOT NULL)
      AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ${userId})
      AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ${userId})
    ORDER BY u.username
  `;
  return rows.map(rowToUser);
}

export async function getUsersWhoAdded(contactId: number): Promise<DbUser[]> {
  const rows = await sql`
    SELECT DISTINCT u.* FROM users u
    LEFT JOIN contacts c ON u.id = c.user_id AND c.contact_id = ${contactId}
    LEFT JOIN messages m ON (u.id = m.sender_id AND m.receiver_id = ${contactId})
                         OR (u.id = m.receiver_id AND m.sender_id = ${contactId})
    WHERE u.id != ${contactId}
      AND (c.id IS NOT NULL OR m.id IS NOT NULL)
      AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ${contactId})
      AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ${contactId})
    ORDER BY u.username
  `;
  return rows.map(rowToUser);
}

export async function blockUser(blockerId: number, blockedId: number): Promise<void> {
  await sql`
    INSERT INTO blocks (blocker_id, blocked_id)
    VALUES (${blockerId}, ${blockedId})
    ON CONFLICT DO NOTHING
  `;
  await sql`
    DELETE FROM contacts
    WHERE user_id = ${blockerId} AND contact_id = ${blockedId}
  `;
}

export async function unblockUser(blockerId: number, blockedId: number): Promise<void> {
  await sql`DELETE FROM blocks WHERE blocker_id = ${blockerId} AND blocked_id = ${blockedId}`;
}

export async function isBlocked(blockerId: number, blockedId: number): Promise<boolean> {
  const [row] = await sql`
    SELECT 1 FROM blocks WHERE blocker_id = ${blockerId} AND blocked_id = ${blockedId}
  `;
  return !!row;
}

export async function getBlockedUsers(userId: number): Promise<DbUser[]> {
  const rows = await sql`
    SELECT u.* FROM users u
    JOIN blocks b ON u.id = b.blocked_id
    WHERE b.blocker_id = ${userId}
  `;
  return rows.map(rowToUser);
}

export interface DbGroup {
  id: number;
  name: string;
  members: string[];
}

export async function createGroup(
  name: string,
  creatorId: number,
  keys: Record<string, string>,
): Promise<DbGroup | null> {
  if (Object.keys(keys).length < 2) return null;

  const creatorRow = await getUserById(creatorId);
  if (!creatorRow || !keys[creatorRow.username]) return null;

  for (const encryptedKey of Object.values(keys)) {
    if (typeof encryptedKey !== "string" || encryptedKey.length < 10) return null;
  }

  try {
    return await getSqlClient().begin(async (tx: postgres.TransactionSql) => {
      const usernames = Object.keys(keys);
      const foundUsers = await tx`
        SELECT username FROM users WHERE username = ANY(${usernames})
      `;
      if (foundUsers.length !== usernames.length) return null;

      const [grp] = await tx`
        INSERT INTO groups (name, creator_id)
        VALUES (${name}, ${creatorId})
        RETURNING id, name
      `;
      if (!grp) return null;

      for (const [username, encryptedKey] of Object.entries(keys)) {
        const role = username === creatorRow.username ? "admin" : "member";
        await tx`
          INSERT INTO group_members (group_id, user_id, role)
          SELECT ${grp.id}, id, ${role} FROM users WHERE username = ${username}
          ON CONFLICT DO NOTHING
        `;
        await tx`
          INSERT INTO group_keys (group_id, user_id, key_id, encrypted_key)
          SELECT ${grp.id}, id, 1, ${encryptedKey} FROM users WHERE username = ${username}
        `;
      }

      const members = await tx`
        SELECT u.username FROM users u
        JOIN group_members gm ON u.id = gm.user_id
        WHERE gm.group_id = ${grp.id}
      `;

      return {
        id: grp.id as number,
        name: grp.name as string,
        members: members.map((m: Record<string, unknown>) => m.username as string),
      };
    });
  } catch (err) {
    console.error("createGroup error:", err);
    return null;
  }
}

export async function getGroupsForUser(userId: number): Promise<DbGroup[]> {
  const grps = await sql`
    SELECT g.id, g.name FROM groups g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = ${userId}
  `;
  if (grps.length === 0) return [];

  const groupIds = grps.map((g: Record<string, unknown>) => g.id as number);
  const members = await sql`
    SELECT gm.group_id, u.username
    FROM users u
    JOIN group_members gm ON u.id = gm.user_id
    WHERE gm.group_id = ANY(${groupIds})
  `;

  const membersByGroup = members.reduce<Record<number, string[]>>((acc: Record<number, string[]>, m: Record<string, unknown>) => {
    const gid = m.group_id as number;
    if (!acc[gid]) acc[gid] = [];
    acc[gid].push(m.username as string);
    return acc;
  }, {});

  return grps.map((g: Record<string, unknown>) => ({
    id: g.id as number,
    name: g.name as string,
    members: membersByGroup[g.id as number] ?? [],
  }));
}

export async function isGroupMember(groupId: number, userId: number): Promise<boolean> {
  const [row] = await sql`
    SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${userId}
  `;
  return !!row;
}

export async function isGroupAdmin(groupId: number, userId: number): Promise<boolean> {
  const [row] = await sql`
    SELECT 1 FROM group_members
    WHERE group_id = ${groupId} AND user_id = ${userId} AND role = 'admin'
  `;
  return !!row;
}

export async function saveGroupMessage(
  groupId: number,
  senderId: number,
  ciphertext: string,
  keyId: number,
): Promise<number | undefined> {
  if (!(await isGroupMember(groupId, senderId))) return undefined;
  try {
    const [row] = await sql`
      INSERT INTO group_messages (group_id, sender_id, ciphertext, key_id)
      VALUES (${groupId}, ${senderId}, ${ciphertext}, ${keyId})
      RETURNING id
    `;
    return row?.id as number | undefined;
  } catch (err) {
    console.error("saveGroupMessage error:", err);
    return undefined;
  }
}

export async function getGroupHistory(
  groupId: number,
  limit = 200,
  beforeId?: number,
): Promise<Array<{ id: number; from: string; ciphertext: string; keyId: number; timestamp: string }>> {
  const rows = beforeId != null
    ? await sql`
        SELECT gm.id, u.username AS "from", gm.ciphertext, gm.key_id, gm.timestamp
        FROM group_messages gm
        JOIN users u ON gm.sender_id = u.id
        WHERE gm.group_id = ${groupId} AND gm.id < ${beforeId}
        ORDER BY gm.id DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT gm.id, u.username AS "from", gm.ciphertext, gm.key_id, gm.timestamp
        FROM group_messages gm
        JOIN users u ON gm.sender_id = u.id
        WHERE gm.group_id = ${groupId}
        ORDER BY gm.id DESC
        LIMIT ${limit}
      `;
  return rows
    .map((r: Record<string, unknown>) => ({
      id: r.id as number,
      from: r.from as string,
      ciphertext: r.ciphertext as string,
      keyId: r.key_id as number,
      timestamp: String(r.timestamp),
    }))
    .reverse();
}

export async function getGroupKeysForUser(
  groupId: number,
  userId: number,
): Promise<Array<{ keyId: number; encryptedKey: string }>> {
  if (!(await isGroupMember(groupId, userId))) return [];
  const rows = await sql`
    SELECT key_id, encrypted_key FROM group_keys
    WHERE group_id = ${groupId} AND user_id = ${userId}
  `;
  return rows.map((r: Record<string, unknown>) => ({ keyId: r.key_id as number, encryptedKey: r.encrypted_key as string }));
}

export async function addGroupMember(
  groupId: number,
  username: string,
  encryptedKey: string,
  keyId: number,
): Promise<boolean> {
  try {
    return await getSqlClient().begin(async (tx: postgres.TransactionSql) => {
      const res = await tx`
        INSERT INTO group_members (group_id, user_id)
        SELECT ${groupId}, id FROM users WHERE username = ${username}
        ON CONFLICT DO NOTHING
      `;
      if (res.count === 0) return false;

      await tx`
        INSERT INTO group_keys (group_id, user_id, key_id, encrypted_key)
        SELECT ${groupId}, id, ${keyId}, ${encryptedKey} FROM users WHERE username = ${username}
        ON CONFLICT DO NOTHING
      `;
      return true;
    });
  } catch {
    return false;
  }
}

export type RemoveGroupMemberError = "LAST_ADMIN" | "NOT_FOUND";
export type RemoveGroupMemberResult =
  | { success: true }
  | { success: false; error: RemoveGroupMemberError };

export async function removeGroupMember(groupId: number, username: string): Promise<RemoveGroupMemberResult> {
  try {
    return await getSqlClient().begin(async (tx: postgres.TransactionSql) => {
      const [target] = await tx`
        SELECT gm.user_id, gm.role FROM group_members gm
        JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = ${groupId} AND u.username = ${username}
      `;
      if (!target) return { success: false, error: "NOT_FOUND" as const };

      if (target.role === "admin") {
        const [{ count }] = await tx`
          SELECT COUNT(*)::int AS count FROM group_members
          WHERE group_id = ${groupId} AND role = 'admin'
        `;
        if ((count as number) <= 1) {
          // Refuse to leave the group without at least one remaining admin.
          return { success: false, error: "LAST_ADMIN" as const };
        }
      }

      await tx`
        DELETE FROM group_members WHERE group_id = ${groupId} AND user_id = ${target.user_id}
      `;
      return { success: true as const };
    });
  } catch {
    return { success: false, error: "NOT_FOUND" };
  }
}

export type RotateGroupKeyResult =
  | { success: true; keyId: number }
  | { success: false };

// keyId is derived server-side inside a serializable transaction to prevent
// concurrent rotation races without relying on a separate sequence object.
export async function rotateGroupKey(
  groupId: number,
  keys: Record<string, string>,
): Promise<RotateGroupKeyResult> {
  try {
    return await getSqlClient().begin(async (tx: postgres.TransactionSql) => {
      // Lock the parent groups row rather than group_keys rows. group_keys is
      // empty on the very first rotation, so locking it acquires nothing and
      // two concurrent first-rotations would both compute key_id = 1. The
      // groups row always exists and serialises all rotations for this group.
      await tx`
        SELECT 1 FROM groups
        WHERE id = ${groupId}
        FOR UPDATE
      `;

      const [{ next_key_id }] = await tx`
        SELECT COALESCE(MAX(key_id), 0) + 1 AS next_key_id
        FROM group_keys
        WHERE group_id = ${groupId}
      `;
      const keyId = next_key_id as number;

      for (const [username, encryptedKey] of Object.entries(keys)) {
        await tx`
          INSERT INTO group_keys (group_id, user_id, key_id, encrypted_key)
          SELECT ${groupId}, u.id, ${keyId}, ${encryptedKey}
          FROM users u
          JOIN group_members gm ON u.id = gm.user_id
          WHERE u.username = ${username} AND gm.group_id = ${groupId}
          ON CONFLICT DO NOTHING
        `;
      }

      return { success: true as const, keyId };
    });
  } catch (err) {
    console.error("rotateGroupKey error:", err);
    return { success: false };
  }
}
