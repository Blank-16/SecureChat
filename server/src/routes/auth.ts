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
  if (existing && hasActiveSession(existing.id)) {
    res.status(409).json({ error: "username taken" });
    return;
  }

  let user = existing;
  if (!user) {
    user = createUser(username, publicKey) ?? undefined;
    if (!user) {
      res.status(409).json({ error: "Username taken" });
      return;
    }
  } else {
    user = createUser(username, publicKey) ?? existing;
  }

  if (!user) {
    res.status(500).json({ error: "failed to create user" });
    return;
  }

  const token = randomUUID();
  createSession(user.id, token);

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

  const session = getSessionByToken(token);
  if (!session) {
    res.status(401).json({ error: "invalid session" });
    return;
  }

  res.status(200).json({ userId: session.userId });
});
