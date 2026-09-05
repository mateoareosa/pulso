# ADR-003: Opaque Persistent Sessions and Cookie Security

## Status

Accepted

## Context

Pulso requires persistent, revocable session management for cashiers, managers, and business owners operating point-of-sale terminals. We evaluated stateless JWTs stored in `localStorage` vs revocable opaque sessions delivered via `httpOnly` secure cookies and persisted in PostgreSQL.

## Decision

We chose **revocable opaque sessions stored in PostgreSQL as SHA-256 hashes** and delivered strictly via `httpOnly`, `sameSite: lax` cookies named `pulso_session`.

### Technical Architecture

1. **Token Generation**: High-entropy 256-bit random tokens generated on the server using Node's cryptographically secure pseudo-random number generator (`crypto.randomBytes(32).toString('hex')`).
2. **Storage Isolation**: The plaintext token is NEVER stored in PostgreSQL. Only the deterministic SHA-256 hex digest (`crypto.createHash('sha256').update(token).digest('hex')`) is persisted in the `sessions` table.
3. **Cookie Transport**: The raw token is transported exclusively via HTTP cookies:
   - `httpOnly: true`: Inaccessible to client-side JavaScript, preventing session token exfiltration via script injection (XSS cannot read the token; defense-in-depth applies as XSS could still trigger authenticated requests).
   - `sameSite: 'lax'`: Mitigates Cross-Site Request Forgery (CSRF) for top-level navigation.
   - `secure`: Inviolable in production. When `NODE_ENV === 'production'`, `secure: true` is unconditionally enforced. In development or test, `COOKIE_SECURE` can toggle the flag for local testing. A misconfigured environment variable can never disable `Secure` in production.
   - `path: '/'`: Uniform path routing.
   - `expires`: Hard expiration aligned with PostgreSQL `expiresAt` (configurable via `SESSION_TTL_HOURS`, default 24h).
4. **Origin & Referer Validation Guard (`OriginValidationGuard`)**:
   - Provides defense-in-depth CSRF protection on all state-mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`).
   - Prioritizes the `Origin` header, checking against `ALLOWED_ORIGINS`.
   - If `Origin` is omitted (e.g. standard form navigations), falls back to extracting the protocol and host from `Referer`.
   - Rejects malformed `Referer` values immediately with 400 Bad Request.
   - In production, rejects state-changing requests missing both `Origin` and `Referer` with 403 Forbidden.
   - In development/test environments, allows local loopback origins (`localhost`, `127.0.0.1`).
5. **Rate Limiting with Bounded In-Memory Storage**:
   - Protects sensitive authentication endpoints (`/auth/register`, `/auth/login`) against brute-force and credential stuffing.
   - Implements a sliding window per key (IP and normalized email) with a strict capacity cap of 10,000 keys, proactive TTL cleanup via unreferenced timer (`unref`), and FIFO eviction on capacity overflow to guard against memory exhaustion attacks.
   - Documented and bounded for single-instance monolithic deployment; distributed storage (Redis/Valkey) will be adopted if horizontal scaling is introduced.
6. **Instant Revocation**: Sessions can be instantly invalidated by setting `revokedAt = NOW()`.
7. **No Secret Bleed**: Session tokens, passwords, and password hashes are strictly forbidden from API response bodies and logs.

## Consequences

- **Positive**: Immediate revocation capability, prevents token exfiltration via XSS, zero sensitive token exposure in browser storage (`localStorage` or `IndexedDB`).
- **Positive**: If the database is compromised, attackers only obtain SHA-256 hashes of 256-bit random entropy, rendering rainbow tables and offline cracking mathematically infeasible.
- **Negative**: Requires a database lookup on authenticated requests (mitigated by indexing `tokenHash` and pooling connections via Prisma).
