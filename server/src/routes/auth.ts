import { Router, type Request, type Response } from "express";
import {
  createUser,
  getUserByUsername,
  createSession,
  deleteSession,
  getSessionByToken,
  hasActiveSession,
} from "../db";
import { randomUUID } from "crypto";
import {
  parseCookies,
  buildSetCookieHeader,
  buildClearCookieHeader,
  COOKIE_NAME,
} from "../cookies";
import { DbUser } from "../types/db";

export const authRouter = Router();

authRouter.post("/register", (req: Request, res: Response) => {
  const username = (req.body?.username as string | undefined)?.trim();
  const publicKey = (req.body?.publicKey as string | undefined)?.trim();

  if (!username || !publicKey) {
    res.status(400).json({ error: "username and publicKey required" });
    return;
  }

  if (!/^[a-zA-Z0-9_-]{2,24}$/.test(username)) {
    res.status(400).json({ error: "invalid username format" });
    return;
  }

  const existing = getUserByUsername(username);

  // Prevent hijacking if the user is currently online
  if (existing && hasActiveSession(existing.id)) {
    res.status(409).json({ error: "username is already active" });
    return;
  }

  let user: DbUser | undefined = existing;

  if (!user) {
    // New user registration path
    const result = createUser(username, publicKey);
    if (!result.success) {
      res.status(result.error === "ALREADY_EXISTS" ? 409 : 500).json({ 
        error: result.error === "ALREADY_EXISTS" ? "username taken" : "database error" 
      });
      return;
    }
    user = result.data;
  } else {
    // Login path for existing users: verify public key
    if (user.publicKey !== publicKey) {
      res.status(401).json({ error: "public key mismatch" });
      return;
    }
  }

  const token = randomUUID();
  const sessionResult = createSession(user.id, token);

  // Handle session creation failures (e.g. DB locks or collisions)
  if (!sessionResult.success) {
    res.status(500).json({ error: "failed to create session" });
    return;
  }

  res.setHeader("Set-Cookie", buildSetCookieHeader(token));
  res.status(200).json({ userId: user.id, username: user.username });
});

authRouter.post("/logout", (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie ?? "");
  const token = cookies[COOKIE_NAME];
  if (token) deleteSession(token);

  res.setHeader("Set-Cookie", buildClearCookieHeader());
  res.status(200).json({ ok: true });
});

authRouter.get("/me", (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie ?? "");
  const token = cookies[COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: "no session" });
    return;
  }

  // Validate session and automatically handle expiration via getSessionByToken
  const session = getSessionByToken(token);
  if (!session) {
    res.status(401).json({ error: "invalid session" });
    return;
  }

  res.status(200).json({ userId: session.userId });
});
