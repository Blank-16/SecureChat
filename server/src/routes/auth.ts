import { Router, type Request, type Response } from "express";
import {
  createUser,
  getUserByUsername,
  createSession,
  deleteSession,
  getSessionByToken,
  hasActiveSession,
  getUserById,
  saveChallenge,
  getChallenge,
  deleteChallenge,
} from "../db";
import { randomUUID, randomBytes } from "crypto";
import { publicEncrypt, constants } from "crypto";
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
  const displayName = (req.body?.displayName as string | undefined)?.trim();
  const publicKey = (req.body?.publicKey as string | undefined)?.trim();

  if (!username || !displayName || !publicKey) {
    res.status(400).json({ error: "username, displayName, and publicKey required" });
    return;
  }

  if (!/^[a-zA-Z0-9_-]{2,24}$/.test(username)) {
    res.status(400).json({ error: "invalid username format" });
    return;
  }

  const existing = getUserByUsername(username);
  if (existing) {
    res.status(409).json({ error: "username taken" });
    return;
  }

  const result = createUser(username, displayName, publicKey);
  if (!result.success) {
    res.status(500).json({ error: "database error" });
    return;
  }

  const user = result.data;
  const token = randomUUID();
  const sessionResult = createSession(user.id, token);

  if (!sessionResult.success) {
    res.status(500).json({ error: "failed to create session" });
    return;
  }

  res.setHeader("Set-Cookie", buildSetCookieHeader(token));
  res.status(200).json({ userId: user.id, username: user.username, displayName: user.displayName });
});

authRouter.post("/challenge", (req: Request, res: Response) => {
  const username = (req.body?.username as string | undefined)?.trim();
  if (!username) {
    res.status(400).json({ error: "username required" });
    return;
  }

  const user = getUserByUsername(username);
  if (!user) {
    res.status(404).json({ error: "user not found" });
    return;
  }

  if (hasActiveSession(user.id)) {
    res.status(409).json({ error: "username is already active" });
    return;
  }

  const nonce = randomBytes(32).toString("base64");
  saveChallenge(username, nonce);

  try {
    const keyObj = {
      key: Buffer.from(user.publicKey, "base64"),
      format: "der" as const,
      type: "spki" as const,
    };
    
    // Explicitly using RSA-OAEP with SHA-256 to match Web Crypto API settings
    const encryptedBuffer = publicEncrypt(
      {
        ...keyObj,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(nonce, "utf8")
    );
    
    res.status(200).json({ encryptedNonce: encryptedBuffer.toString("base64") });
  } catch (err) {
    console.error("Encryption error:", err);
    res.status(500).json({ error: "failed to generate challenge" });
  }
});

authRouter.post("/login", (req: Request, res: Response) => {
  const username = (req.body?.username as string | undefined)?.trim();
  const decryptedNonce = (req.body?.decryptedNonce as string | undefined)?.trim();

  if (!username || !decryptedNonce) {
    res.status(400).json({ error: "username and decryptedNonce required" });
    return;
  }

  const user = getUserByUsername(username);
  if (!user) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }

  if (hasActiveSession(user.id)) {
    res.status(409).json({ error: "username is already active" });
    return;
  }

  const storedNonce = getChallenge(username);
  if (!storedNonce) {
    res.status(401).json({ error: "challenge expired or not found" });
    return;
  }

  // Prevent replay attacks
  deleteChallenge(username);

  if (storedNonce !== decryptedNonce) {
    res.status(401).json({ error: "invalid challenge response" });
    return;
  }

  const token = randomUUID();
  const sessionResult = createSession(user.id, token);

  if (!sessionResult.success) {
    res.status(500).json({ error: "failed to create session" });
    return;
  }

  res.setHeader("Set-Cookie", buildSetCookieHeader(token));
  res.status(200).json({ userId: user.id, username: user.username, displayName: user.displayName });
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

  const user = getUserById(session.userId);
  if (!user) return res.status(401).json({ error: "user not found" });

  res.status(200).json({ userId: session.userId, username: user.username, displayName: user.displayName });
});
