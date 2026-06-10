import { Router, type Request, type Response } from "express";
import { createUser, getUserByUsername, createSession, deleteSession, getSessionByToken, getUserById, saveChallenge, getChallenge, deleteChallenge } from "../db";
import { randomUUID, randomBytes, createPublicKey, verify } from "crypto";
import { parseCookies, buildSetCookieHeader, buildClearCookieHeader, COOKIE_NAME } from "../cookies";

export const authRouter = Router();

const MAX_DISPLAY_NAME_LEN = 64;
const MAX_KEY_LEN = 4096;

authRouter.post("/register", (req: Request, res: Response) => {
  const username = (req.body?.username as string | undefined)?.trim();
  const displayName = (req.body?.displayName as string | undefined)?.trim();
  const identityKey = (req.body?.identityKey as string | undefined)?.trim();
  const preKey = (req.body?.preKey as string | undefined)?.trim();
  const preKeySignature = (req.body?.preKeySignature as string | undefined)?.trim();

  if (!username || !displayName || !identityKey || !preKey || !preKeySignature) {
    res.status(400).json({ error: "missing fields" });
    return;
  }
  if (!/^[a-zA-Z0-9_-]{2,24}$/.test(username)) {
    res.status(400).json({ error: "invalid username format" });
    return;
  }
  if (displayName.length > MAX_DISPLAY_NAME_LEN) {
    res.status(400).json({ error: `displayName must be at most ${MAX_DISPLAY_NAME_LEN} characters` });
    return;
  }
  if (identityKey.length > MAX_KEY_LEN || preKey.length > MAX_KEY_LEN || preKeySignature.length > MAX_KEY_LEN) {
    res.status(400).json({ error: "key too long" });
    return;
  }

  try {
    const key = createPublicKey({ key: Buffer.from(identityKey, "base64"), format: "der", type: "spki" });
    // Verify preKey signature
    const isValidPreKey = verify(
      "sha256",
      Buffer.from(preKey, "utf8"),
      key,
      Buffer.from(preKeySignature, "base64")
    );
    if (!isValidPreKey) {
      res.status(400).json({ error: "invalid preKey signature" });
      return;
    }
  } catch (err) {
    res.status(400).json({ error: "invalid identityKey format" });
    return;
  }

  const result = createUser(username, displayName, identityKey, preKey, preKeySignature);
  if (!result.success) {
    if (result.error === "ALREADY_EXISTS") {
      res.status(409).json({ error: "username taken" });
    } else {
      res.status(500).json({ error: "database error" });
    }
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
    res.status(401).json({ error: "invalid credentials" });
    return;
  }

  const nonce = randomBytes(32).toString("base64");
  saveChallenge(username, nonce);
  res.status(200).json({ nonce });
});

authRouter.post("/login", (req: Request, res: Response) => {
  const username = (req.body?.username as string | undefined)?.trim();
  const signature = (req.body?.signature as string | undefined)?.trim();

  if (!username || !signature) {
    res.status(400).json({ error: "username and signature required" });
    return;
  }

  const user = getUserByUsername(username);
  if (!user) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }

  const storedNonce = getChallenge(username);
  if (!storedNonce) {
    res.status(401).json({ error: "challenge expired or not found" });
    return;
  }

  deleteChallenge(username);

  try {
    const key = createPublicKey({ key: Buffer.from(user.identityKey, "base64"), format: "der", type: "spki" });
    const valid = verify(
      "sha256",
      Buffer.from(storedNonce, "utf8"),
      key,
      Buffer.from(signature, "base64")
    );
    if (!valid) {
      res.status(401).json({ error: "invalid signature" });
      return;
    }
  } catch (err) {
    res.status(401).json({ error: "signature verification failed" });
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
  if (!user) {
    res.status(401).json({ error: "user not found" });
    return;
  }

  res.status(200).json({ userId: session.userId, username: user.username, displayName: user.displayName });
});
