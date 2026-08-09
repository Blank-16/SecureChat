import { Router, type Request, type Response } from "express";
import { createUser, getUserByUsername, createSession, deleteSession, getSessionByToken, getUserById, saveChallenge, getChallenge, deleteChallenge } from "../db";
import { randomBytes, createPublicKey, verify, generateKeyPairSync } from "crypto";
import { parseCookies, buildSetCookieHeader, buildClearCookieHeader, COOKIE_NAME } from "../cookies";

export const authRouter = Router();

const MAX_DISPLAY_NAME_LEN = 64;
const MAX_KEY_LEN = 4096;

// Pre-generated once at startup. Used by the dummy verification path in /login
// to ensure the CPU cost of the false branch matches the real branch, preventing
// a timing side-channel that would expose whether a username is registered.
const { publicKey: DUMMY_VERIFY_KEY } = generateKeyPairSync("ec", { namedCurve: "P-256" });

// 256-bit session token, hashed before storage (see db.ts).
function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

authRouter.post("/register", async (req: Request, res: Response) => {
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
  } catch {
    res.status(400).json({ error: "invalid identityKey format" });
    return;
  }

  const result = await createUser(username, displayName, identityKey, preKey, preKeySignature);
  if (!result.success) {
    if (result.error === "ALREADY_EXISTS") {
      res.status(409).json({ error: "username taken" });
    } else {
      res.status(500).json({ error: "database error" });
    }
    return;
  }

  const user = result.data;
  const token = generateSessionToken();
  const sessionResult = await createSession(user.id, token);

  if (!sessionResult.success) {
    res.status(500).json({ error: "failed to create session" });
    return;
  }

  res.setHeader("Set-Cookie", buildSetCookieHeader(token));
  res.status(200).json({ userId: user.id, username: user.username, displayName: user.displayName });
});

// Returns 200 with a nonce regardless of whether the username exists,
// to avoid leaking registered usernames via response timing or body.
authRouter.post("/challenge", async (req: Request, res: Response) => {
  const username = (req.body?.username as string | undefined)?.trim();
  if (!username) {
    res.status(400).json({ error: "username required" });
    return;
  }

  const nonce = randomBytes(32).toString("base64");
  const user = await getUserByUsername(username);
  if (user) {
    await saveChallenge(username, nonce);
  }
  // For unknown usernames the nonce is returned but never stored; /login
  // will fail at the "challenge expired or not found" check.
  res.status(200).json({ nonce });
});

authRouter.post("/login", async (req: Request, res: Response) => {
  const username = (req.body?.username as string | undefined)?.trim();
  const signature = (req.body?.signature as string | undefined)?.trim();

  if (!username || !signature) {
    res.status(400).json({ error: "username and signature required" });
    return;
  }

  const [user, storedNonce] = await Promise.all([
    getUserByUsername(username),
    getChallenge(username),
  ]);

  // Consume the nonce immediately regardless of outcome. A challenge must be
  // single-use; leaving it in the table on a failed attempt would allow an
  // attacker to make unlimited signature-brute-force attempts against one nonce.
  if (storedNonce) await deleteChallenge(username);

  // Always execute signature verification, even for unknown users or expired
  // challenges. DUMMY_VERIFY_KEY is a valid P-256 key so verify() actually runs
  // and takes comparable CPU time to the real path, closing the timing oracle.
  let verified = false;
  try {
    if (user && storedNonce) {
      const key = createPublicKey({ key: Buffer.from(user.identityKey, "base64"), format: "der", type: "spki" });
      verified = verify(
        "sha256",
        Buffer.from(storedNonce, "utf8"),
        key,
        Buffer.from(signature, "base64"),
      );
    } else {
      // Run a real ECDSA verify against the pre-generated dummy key so the
      // branch takes the same CPU time as a legitimate failed verification.
      verify("sha256", randomBytes(32), DUMMY_VERIFY_KEY, Buffer.from(signature, "base64"));
    }
  } catch {
    // Swallow errors from the dummy path (signature format mismatch) and from
    // malformed real requests — all resolve to the same 401 below.
  }

  if (!verified) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }

  // `verified` is only true when `user && storedNonce` held, so `user` is
  // always defined here. The guard satisfies TypeScript's narrowing.
  if (!user) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }

  const token = generateSessionToken();
  const sessionResult = await createSession(user.id, token);

  if (!sessionResult.success) {
    res.status(500).json({ error: "failed to create session" });
    return;
  }

  res.setHeader("Set-Cookie", buildSetCookieHeader(token));
  res.status(200).json({ userId: user.id, username: user.username, displayName: user.displayName });
});

authRouter.post("/logout", async (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie ?? "");
  const token = cookies[COOKIE_NAME];
  if (token) await deleteSession(token);

  res.setHeader("Set-Cookie", buildClearCookieHeader());
  res.status(200).json({ ok: true });
});

authRouter.get("/me", async (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie ?? "");
  const token = cookies[COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: "no session" });
    return;
  }

  const session = await getSessionByToken(token);
  if (!session) {
    res.status(401).json({ error: "invalid session" });
    return;
  }

  const user = await getUserById(session.userId);
  if (!user) {
    res.status(401).json({ error: "user not found" });
    return;
  }

  res.status(200).json({ userId: session.userId, username: user.username, displayName: user.displayName });
});
