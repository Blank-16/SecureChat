# Theoretical Security Concepts

This document provides a theoretical overview of how common vulnerabilities and logic flaws in modern real-time chat architectures are typically addressed.

## 1. Mitigating Cross-Site WebSocket Hijacking (CSWSH)
WebSockets do not enforce the Same-Origin Policy in the same way that standard HTTP requests do. If an endpoint uses cookies for authentication, a malicious site can initiate a WebSocket connection to the server, and the browser will automatically attach the user's cookies. 

**Conceptual Fix:**
*   **Origin Validation:** During the WebSocket upgrade handshake, the server must inspect the `Origin` header sent by the browser and strictly compare it against a whitelist of trusted domains. If the origin does not match, the connection should be rejected with an HTTP 403 Forbidden status.
*   **Token-based Authentication:** Instead of relying on cookies, pass an authentication token (like a JWT) in the WebSocket subprotocol header or as the very first message sent immediately after the connection opens. If the first message isn't a valid token within a short timeout period, close the connection.

## 2. Securing Cryptographic Keys in the Browser
Storing highly sensitive active keys (like ratchet chain keys) in plaintext inside browser storage (IndexedDB, LocalStorage) exposes them to extraction if the device is compromised or if an XSS vulnerability is exploited.

**Conceptual Fix:**
*   **Non-Extractable Keys:** When deriving or importing keys using the Web Crypto API, the `extractable` flag should ideally be set to `false`. While standard IndexedDB implementations can sometimes store non-extractable keys via structured cloning, the underlying key material never enters JavaScript memory space again after creation.
*   **Key Wrapping:** For keys that must be persisted across sessions, a "Key Wrapping" strategy is standard. A root wrapping key is derived from a user-supplied passphrase using a key derivation function (like PBKDF2 or Argon2). All active session keys are then encrypted (wrapped) using AES-KW or AES-GCM before being written to IndexedDB. They are unwrapped in memory only when actively needed.

## 3. Implementing Safe Chat Deletion (Soft Deletes)
In messaging applications, one user deleting a chat should not affect the other user's view of the chat history. Dropping rows from a shared database table causes irreversible data loss for the other party.

**Conceptual Fix:**
*   **Flag-based Soft Deletes:** Add columns such as `deleted_by_sender` and `deleted_by_receiver` (booleans or timestamps) to the message schema. When a user deletes a chat, the server updates the corresponding flag for that user's perspective rather than deleting the row. A background cron job can permanently delete the row only when *both* flags are set.
*   **Deletion Markers:** For conversation metadata, maintain a "last cleared timestamp" for each user per conversation. Queries for chat history only return messages where the `created_at` timestamp is greater than the user's clearing timestamp.

## 4. Double Ratchet Synchronization
A symmetric ratchet relies on hashing the current key to generate the next key. If the network drops a message or messages arrive out of order, the receiving ratchet will attempt to use the wrong key and fail to decrypt.

**Conceptual Fix:**
*   **Message Headers (Indices):** Every encrypted message payload must include a plaintext (but authenticated) header containing a sequence number or message index.
*   **Skipped Key Management:** When the receiver gets a message with an index higher than expected, it continuously ratchets the chain key to catch up. The intermediate message keys for the "skipped" messages are temporarily stored in a secure dictionary. If the delayed messages arrive later, they are decrypted using the stored skipped keys. 

## 5. Group Permission Models (RBAC)
When any member can add or remove others, a malicious actor can quickly hijack or destroy a group.

**Conceptual Fix:**
*   **Role-Based Access Control:** Group schemas should include member roles (e.g., `MEMBER`, `ADMIN`, `OWNER`). 
*   **Authorization Checks:** Backend endpoints must query the requesting user's role in the group. Removing a member or rotating the group master key should require `ADMIN` or `OWNER` privileges.

## 6. Chat History Pagination
Limiting a database query to a fixed number of messages without a way to request the next batch creates an artificial cutoff where old messages are lost.

**Conceptual Fix:**
*   **Cursor-based Pagination:** Instead of using SQL `OFFSET` (which gets slow as datasets grow), clients send the ID or timestamp of the oldest message they currently have. The backend query fetches the next batch using a `WHERE id < ?` condition, ensuring efficient and scalable history traversal.
