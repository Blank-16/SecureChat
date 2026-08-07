# SecureChat Rework Plan

## Legend
- [CRIT] Critical — production-blocking security bug
- [HIGH] High — significant security or correctness issue
- [MED]  Medium — correctness, protocol integrity, or performance
- [FEAT] Feature — missing expected capability
- [ARCH] Architecture — structural improvement

Status: all items complete

---

## 1. [CRIT] WebSocket origin validation — CSWSH

**File:** `server/src/wsHandlers.ts`

Cookie-based WS auth with no Origin check. Any cross-origin page can open
a WS connection and the browser auto-sends `sc_session`.

**Fix:** On `wss.on("connection")`, validate `req.headers.origin` against
`ALLOWED_ORIGINS` before registering the connection. Reject with close code
4001 on mismatch.

- [x] Add origin validation block at the top of the connection handler

---

## 2. [CRIT] Extractable ratchet chain keys in IndexedDB

**File:** `client/src/utils/crypto/ratchet.ts`

All derived session keys are created with `extractable: true`. An XSS
payload can call `crypto.subtle.exportKey("raw", key)` on any stored chain
key and exfiltrate the entire session state.

**Fix:** Set `extractable: false` on every `importKey`/`deriveKey` call
inside `hkdf()` and `initializeSession()`. Non-extractable keys survive
IndexedDB structured-clone serialisation but cannot be exported by JS.

- [x] Change `hkdf()` deriveKey call — `extractable: false`
- [x] Change `initializeSession()` importKey for sharedSecret — `extractable: false`

---

## 3. [CRIT] No group RBAC — any member can add/remove/rotate

**Files:** `server/src/ws/handlers/group.ts`, `server/src/db.ts`

`handleAddGroupMember`, `handleRemoveGroupMember`, `handleRotateGroupKey`
only check `isGroupMember`. Any member can eject the creator or distribute
a new group master key to themselves only.

**Fix:**
- Add `role` column (`member | admin`) to `group_members` table
- Creator is always inserted as `admin`
- Add `isGroupAdmin(groupId, userId)` DB helper
- Gate add/remove/rotate handlers on `isGroupAdmin`

- [x] Add `role` column to `group_members` DDL
- [x] Add `isGroupAdmin()` to `db.ts`
- [x] Gate `handleAddGroupMember` on admin check
- [x] Gate `handleRemoveGroupMember` on admin check
- [x] Gate `handleRotateGroupKey` on admin check

---

## 4. [HIGH] Session token: UUID v4 → 256-bit random + server-side hash

**File:** `server/src/routes/auth.ts`

`randomUUID()` yields 122 random bits with fixed version nibbles. A DB
dump exposes live session tokens directly.

**Fix:**
- Generate token with `randomBytes(32).toString('hex')` (256 bits, fully random)
- Store `SHA-256(token)` in the `sessions` table
- On lookup, hash the incoming cookie value before querying

- [x] Replace `randomUUID()` with `randomBytes(32).toString('hex')` in register + login
- [x] Store `createHash('sha256').update(token).digest('hex')` in DB
- [x] Update `getSessionByToken` to hash before SELECT
- [x] Update `deleteSession` to hash before DELETE

---

## 5. [HIGH] Username enumeration via /auth/challenge

**File:** `server/src/routes/auth.ts`

`POST /auth/challenge` returns HTTP 401 for unknown usernames and 200 for
known ones. Trivially enumerates all registered users.

**Fix:** Always return 200 with a dummy nonce for unknown users. The
subsequent `POST /auth/login` will fail signature verification silently,
leaking nothing.

- [x] Refactor `/challenge` to return dummy nonce on unknown username

---

## 6. [HIGH] Hard chat deletion destroys other party's history

**Files:** `server/src/db.ts`, `server/src/ws/handlers/chat.ts`

`deleteConversation` issues a hard `DELETE`. When user A deletes a
conversation, user B loses all their messages permanently.

**Fix:** Soft-delete pattern. Add `deleted_by_sender` and
`deleted_by_receiver` boolean columns to `messages`. `deleteConversation`
sets the appropriate flag. `getConversation` filters out messages where the
requesting user's flag is true. Hard-delete only when both flags are set
(via a background sweep or on next load).

- [x] Add `deleted_by_sender` / `deleted_by_receiver` columns to `messages` DDL
- [x] Rewrite `deleteConversation(userAId, userBId)` as a soft-delete UPDATE
- [x] Update `getConversation` to filter by the requesting user's delete flag
- [x] Add `purgeFullyDeletedMessages()` called from the session purge interval

---

## 7. [HIGH] WS frame size check uses character count not byte length

**File:** `server/src/wsHandlers.ts`

`data.toString().length > 65536` counts characters. A payload of 32768
two-byte UTF-8 characters passes but is 65536 bytes. Under Node.js the
`data` argument is already a `Buffer`; use `Buffer.byteLength`.

**Fix:** Check raw buffer length before calling `.toString()`.

- [x] Replace `data.toString().length` check with `Buffer.byteLength(data.toString())`
  or operate on the raw Buffer directly

---

## 8. [MED] Ratchet has no message ordering / skipped-key management

**File:** `client/src/utils/crypto/ratchet.ts`

The symmetric ratchet is a linear chain with no sequence numbers. Any
out-of-order or dropped message permanently desyncs send/receive chains.

**Fix:**
- Add `msgIndex` counter to `SessionState` (separate send/receive counters)
- Include `msgIndex` as a plaintext field in every encrypted payload
- On receive, if `msgIndex > expected`, ratchet forward and cache skipped
  message keys in a `skippedKeys` map keyed by `(peerUsername, index)`
- Cap skipped key window at 100 to prevent unbounded storage

- [x] Add `sendIndex` and `receiveIndex` to `SessionState`
- [x] Add `skippedKeys: Record<number, CryptoKey>` to `SessionState`
- [x] Update `encryptRatchet` to stamp `msgIndex` in JSON payload
- [x] Update `decryptRatchet` to handle skipped keys

---

## 9. [MED] Static HKDF salt — use per-derivation random salt

**File:** `client/src/utils/crypto/ratchet.ts`

`"SecureChatSalt"` is the HKDF salt for every single derivation. The
`info` string alone provides domain separation but a random or
protocol-defined per-session salt is the correct approach per RFC 5869.

**Fix:** Generate a random 32-byte salt during `initializeSession` and
store it in `SessionState`. Pass it to all subsequent `hkdf` calls for
that session.

- [x] Add `hkdfSalt: Uint8Array` to `SessionState`
- [x] Generate random salt in `initializeSession`, persist in session
- [x] Pass session salt to all `hkdf` calls instead of the string literal

---

## 10. [MED] Group master key held as plaintext base64 in JS state

**File:** `client/src/utils/crypto/encryption.ts`

`generateGroupMasterKey()` returns a raw base64 string that circulates
through Zustand state and function parameters. Visible in React devtools
and error serialisation.

**Fix:** Return a `CryptoKey` (`extractable: false`) from
`generateGroupMasterKey()`. Thread `CryptoKey` through
`encryptGroupMessage` and `decryptGroupMessage`. The ECIES-wrapped form
(for server distribution) is produced only at wrap time.

- [x] Change `generateGroupMasterKey()` to return `CryptoKey` (AES-GCM, non-extractable)
- [x] Update `encryptGroupMessage` / `decryptGroupMessage` signatures
- [x] Update `useEncryption` wrapper and all call sites

---

## 11. [MED] No Content-Security-Policy header

**File:** `server/src/app.ts`

Helmet is mounted but no CSP is configured. The default Helmet CSP is
permissive. A strict CSP is the primary XSS mitigation for the browser
crypto store.

**Fix:** Configure Helmet with a strict CSP: `default-src 'self'`,
`script-src 'self'`, `connect-src 'self' wss:`, no `unsafe-inline` or
`unsafe-eval`.

- [x] Add Helmet CSP configuration to `app.ts`

---

## 12. [MED] No pagination on conversation / group history

**Files:** `server/src/db.ts`

`getConversation` and `getGroupHistory` return a fixed last-N with no
cursor. Long conversations lose early messages silently.

**Fix:** Add optional `beforeId?: number` cursor parameter. Query becomes
`WHERE ... AND id < $beforeId ORDER BY id DESC LIMIT ?`. Clients send the
oldest loaded message ID to fetch earlier pages.

- [x] Add `beforeId` param to `getConversation`
- [x] Add `beforeId` param to `getGroupHistory`
- [x] Update WS message types to carry cursor
- [x] Update `handleGetHistory` and `handleGetGroupHistory` handlers

---

## 13. [ARCH] Replace SQLite server DB with PostgreSQL

**Files:** `server/src/db.ts`, `server/package.json`, `docker-compose.yml`

SQLite is a single-writer synchronous database. All WS message saves block
the Node process. No horizontal scaling path.

**Migration:**
- Add `postgres` (postgres.js) dependency
- Rewrite `db.ts` as async, replacing every `.get()` / `.all()` / `.run()`
  with `await sql\`...\``
- Replace `INTEGER PRIMARY KEY AUTOINCREMENT` with `BIGSERIAL`
- Replace `datetime('now')` with `NOW()`
- Replace `db.transaction(fn)` with explicit `BEGIN` / `COMMIT`
- Add `postgres` service to `docker-compose.yml`
- Pass `DATABASE_URL` env var
- Remove `better-sqlite3` dependency

DDL changes:
- `group_members.role TEXT NOT NULL DEFAULT 'member'` (from item 3)
- `messages.deleted_by_sender BOOLEAN NOT NULL DEFAULT FALSE` (from item 6)
- `messages.deleted_by_receiver BOOLEAN NOT NULL DEFAULT FALSE` (from item 6)
- `sessions.token_hash TEXT` — store hash, not raw token (from item 4)
- `messages.cursor` index on `(sender_id, receiver_id, id)` for pagination (from item 12)

- [x] Add `postgres` to server dependencies
- [x] Remove `better-sqlite3`
- [x] Rewrite `db.ts` with async postgres.js client
- [x] Update all DB call sites (they are all already in db.ts — no cascade)
- [x] Add postgres service to docker-compose.yml
- [x] Update server Dockerfile ENV

---

## 14. [FEAT] Passphrase strength indicator on registration

**File:** `client/src/components/auth/RegisterForm.tsx`

Registration enforces no minimum entropy. Users pick weak passphrases
that directly weaken the PBKDF2 wrapping key protecting all private keys.

**Fix:** Add a simple entropy check (zxcvbn-lite or manual char-class +
length scoring) and render a strength bar. Block submission below score 2.

- [x] Add passphrase strength scoring utility
- [x] Add strength bar component to `RegisterForm`
- [x] Block submit if score < 2

---

## 15. [FEAT] Wrong-passphrase vs new-device UX disambiguation

**File:** `client/src/components/auth/LoginForm.tsx`

When `loadPersistedKeyPairs` throws (wrong passphrase or no keys on this
device), the user sees a generic error toast with no recovery path.

**Fix:** Catch the error, check if IDB has a key record at all. If no
record → show "No keys found on this device" with a "Register instead"
link. If record exists but unwrap fails → show "Incorrect passphrase".

- [x] Add `hasPersistedKeys()` helper to `storage.ts`
- [x] Differentiate error branches in `LoginForm`

---

## Summary table

| # | Severity | Area | Status |
|---|---|---|---|
| 1 | CRIT | WS origin validation | [x] |
| 2 | CRIT | Extractable ratchet keys | [x] |
| 3 | CRIT | Group RBAC | [x] |
| 4 | HIGH | Session token entropy + hashing | [x] |
| 5 | HIGH | Username enumeration | [x] |
| 6 | HIGH | Soft delete chat | [x] |
| 7 | HIGH | WS frame byte length | [x] |
| 8 | MED | Ratchet skip-key management | [x] |
| 9 | MED | HKDF salt per-session | [x] |
| 10 | MED | GMK as CryptoKey | [x] |
| 11 | MED | CSP header | [x] |
| 12 | MED | History pagination | [x] |
| 13 | ARCH | SQLite → PostgreSQL | [x] |
| 14 | FEAT | Passphrase strength UI | [x] |
| 15 | FEAT | Login error disambiguation | [x] |

---

## Round 2 — production hardening

Found during a dedicated pass for production-readiness issues after the
items above were complete. These are correctness/operability bugs rather
than the security-audit findings above.

### 16. [HIGH] No process-level crash handlers

**File:** `server/src/index.ts`

An unhandled promise rejection (e.g. a missed `.catch` on a
fire-and-forget DB call) or an uncaught exception in a non-async
callback could crash the process with no log line, or leave it in an
undefined state without a clean shutdown.

- [x] Add `process.on("unhandledRejection", ...)` — log and continue
- [x] Add `process.on("uncaughtException", ...)` — log and exit deliberately

### 17. [HIGH] Error handler leaked internal details to clients

**File:** `server/src/middleware/errorHandler.ts`

Any unhandled error (a DB driver error, a bug) was serialized and sent
to the client as-is, potentially leaking stack traces, file paths, or
schema details.

- [x] 5xx errors now log full detail server-side, return a generic
      `{ error: "internal server error" }` to the client
- [x] 4xx errors (intentional, with a safe message) still pass through
- [x] Added `notFoundHandler` for a clean JSON 404 instead of Express's
      default HTML error page

### 18. [HIGH] No environment validation at boot

**File:** `server/src/env.ts` (new)

A missing or malformed `DATABASE_URL` or `ALLOWED_ORIGINS` previously
surfaced as a confusing runtime failure deep inside a dependency (or, for
`ALLOWED_ORIGINS`, silently fell back to a `localhost`-only allowlist
that would reject every real connection in production with no clear
cause).

- [x] Added `loadEnv()` — validates all required vars once at boot with
      clear, specific error messages
- [x] In production, every `ALLOWED_ORIGINS` entry must be `https://`
- [x] `db.ts` converted from import-time connection (a process-level
      side effect) to an explicit `initDb(databaseUrl)` call so
      initialization order is unambiguous
- [x] `app.ts` and `wsHandlers.ts` converted to factories taking the
      validated origin list as a parameter, instead of each
      independently re-parsing `process.env` (which risked the two
      checks drifting out of sync)

### 19. [MED] Rate-limit bucket map could leak memory

**File:** `server/src/ws/rateLimit.ts`

Buckets were removed on the WS `close` event, but a missed or
out-of-order close (abrupt socket destruction) would leave an entry per
connection for the life of the process.

- [x] Added `sweepStaleRateBuckets()`, run on the existing hourly purge
      interval as a backstop

### 20. [MED] Removing the last group admin left the group unmanageable

**File:** `server/src/db.ts`, `server/src/ws/handlers/group.ts`

`removeGroupMember` had no protection against removing the only
remaining admin from a group, after which no one could add/remove
members or rotate the group key.

- [x] `removeGroupMember` now checks admin count inside the same
      transaction and refuses with a `LAST_ADMIN` error if the target is
      the sole remaining admin
- [x] WS handler surfaces a clear error message instead of silently
      failing

### 21. [MED] Concurrent group key rotation could corrupt GMK distribution

**File:** `server/src/db.ts`, `server/src/ws/handlers/group.ts`, client call sites

`keyId` was computed client-side as "current max + 1". Two admins
rotating concurrently could compute the same `keyId`; the unique
constraint's `ON CONFLICT DO NOTHING` would then silently insert for
some members and no-op for others, leaving the group's key partially
distributed with no error surfaced.

- [x] `rotateGroupKey` now derives `keyId` server-side, inside a
      transaction with `SELECT ... FOR UPDATE` locking, eliminating the
      race
- [x] Removed `keyId` from the client-to-server `rotate_group_key`
      payload and the `RotateGroupKeyPayload` type
- [x] Updated `ChatDashboard.tsx` to stop computing `newKeyId` client-side

### 22. [LOW] No real health check — server healthcheck only verified the container was running, not the app

**File:** `server/src/app.ts`, `docker-compose.yml`

`nginx`'s `depends_on: server` only waited for the container to start,
not for the Express app inside it to be ready and able to reach
Postgres.

- [x] Added `GET /healthz`, which runs `SELECT 1` against the DB and
      returns 503 if it fails
- [x] Added a Docker healthcheck on the `server` service hitting `/healthz`
- [x] `nginx` now depends on `server: condition: service_healthy`
      instead of just `service_started`

### 23. [LOW] Stale `.env` files missing required variables

The committed `server/.env` predated the Postgres migration and only had
`PORT` set — it would fail `loadEnv()` immediately.

- [x] Updated `server/.env` with all required variables for local dev
- [x] Added `server/.env.example`, `client/.env.example`, and a root
      `.env.example` for `POSTGRES_PASSWORD`, documenting every variable
      consumed by `docker-compose.yml`

### Summary table — round 2

| # | Severity | Area | Status |
|---|---|---|---|
| 16 | HIGH | Process-level crash handlers | [x] |
| 17 | HIGH | Error handler leaking internals | [x] |
| 18 | HIGH | Boot-time env validation | [x] |
| 19 | MED | Rate-limit bucket memory leak | [x] |
| 20 | MED | Last-admin removal bug | [x] |
| 21 | MED | Concurrent key rotation race | [x] |
| 22 | LOW | Real health check | [x] |
| 23 | LOW | Stale env files | [x] |
