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

    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
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
