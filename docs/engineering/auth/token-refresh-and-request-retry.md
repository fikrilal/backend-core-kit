# Auth Token Refresh & Request Retry (Client ↔ Backend Contract)

This document clarifies the backend semantics needed for safe client-side token refresh, request retry, and **write** safety via **idempotency keys**.

It complements:

- `docs/standards/authentication.md`
- `docs/standards/reliability.md`
- `docs/standards/api-response-standard.md`

## Terminology

- **Access token**: short-lived JWT used as `Authorization: Bearer <token>`.
- **Refresh token**: long-lived opaque secret used to mint a new access token (rotated on refresh).
- **Write request**: `POST`, `PUT`, `PATCH`, `DELETE`.
- **Idempotency key**: a client-generated key that makes a write safe to retry.

## Backend guarantees (required for safe retry UX)

### 1) Auth checks happen before side effects

For protected endpoints, the backend validates authentication/authorization in Nest guards **before** controller handlers run:

- Missing/invalid/expired access token → `401` (`code: UNAUTHORIZED`)
- Token valid but permission missing → `403` (`code: FORBIDDEN`)

Implication:

- A `401`/`403` from a protected endpoint guarantees **no handler logic executed** and therefore no intentional mutations ran.

### 2) Refresh token rotation

`POST /v1/auth/refresh` rotates refresh tokens:

- Success: returns a new access token **and** a new refresh token.
- Failure: returns `401` with a stable feature error code (see below).

Client implications:

- Do not run concurrent refresh calls with the same refresh token.
- If refresh returns a non-2xx response (e.g. `429`/`5xx`), the refresh token is **not** rotated/consumed and may be retried.
- If a refresh attempt’s outcome is unknown (timeout / app killed), treat the session as suspect and re-authenticate or recover via a conservative flow.

### 3) Error code meanings (canonical)

Global (cross-cutting):

- `UNAUTHORIZED` (`401`): missing/invalid access token.
- `FORBIDDEN` (`403`): authenticated but not allowed (RBAC).
- `VALIDATION_FAILED` (`400`): invalid input; check `errors[]`.
- `CONFLICT` (`409`): conflicts (including idempotency key conflicts).
- `IDEMPOTENCY_IN_PROGRESS` (`409`): duplicate idempotent write still processing.

Auth feature codes (all `401`):

- `AUTH_REFRESH_TOKEN_INVALID`
- `AUTH_REFRESH_TOKEN_EXPIRED`
- `AUTH_REFRESH_TOKEN_REUSED`
- `AUTH_SESSION_REVOKED`

## Recommended client behavior

### Preflight refresh (optional UX improvement)

If the client can accurately predict access token expiry, it may refresh shortly before expiry to avoid 401s.

This is purely an optimization; the backend still enforces auth via `401`.

### 401 refresh + retry

**Reads (`GET`/`HEAD`)**

- Safe to retry after a refresh because reads are expected to be idempotent.

**Writes (`POST`/`PUT`/`PATCH`/`DELETE`)**

- Do not auto-retry writes after 401 unless the request is protected by an idempotency key (next section).

## Idempotency keys (safe retries for writes)

### Why you need this

Clients can receive an “unknown outcome” on writes (timeouts, connection drops, app killed) even though the backend executed the mutation.

Blindly retrying a write can produce duplicate side effects.

Idempotency keys make “retry” safe:

- the first request executes the mutation and stores the result under the key
- subsequent requests with the same key return the same result (replay) without reapplying the mutation

### HTTP contract

Client sends:

- `Idempotency-Key: <uuid>` (recommended for write endpoints that clients may retry)

Backend may respond with:

- `Idempotency-Replayed: true` when a cached response is returned
- `409` `IDEMPOTENCY_IN_PROGRESS` when the same key is already being processed

If the same idempotency key is reused with a **different** payload:

- `409` `CONFLICT` (client bug / key collision)

### Backend implementation in this kit

This kit provides Redis-backed idempotency for HTTP endpoints:

- Decorator: `@Idempotent({ scopeKey?: string, required?: boolean, ttlSeconds?: number, waitMs?: number, lockTtlSeconds?: number })`
- OpenAPI helper: `@ApiIdempotencyKeyHeader({ required?: boolean })`
- Transport behavior:
  - first request stores an “in progress” lock in Redis
  - on success, stores the response for replay for `ttlSeconds`
  - a retry returns the stored response + `Idempotency-Replayed: true`

Important notes:

- Idempotency is **opt-in per endpoint** (use the decorator).
- By default, `Idempotency-Key` is **optional**. Set `required: true` for endpoints where clients must always supply it.
- Idempotency requires Redis when the header is used (staging/prod already require Redis by env validation).

### Client retry guidance (writes)

On write failure:

- If you got a `401`:
  - refresh, then retry once (same payload). Use an idempotency key if you retry.
- If you got a timeout / network error / unknown outcome:
  - retry with the **same idempotency key**.
- If you got `409 IDEMPOTENCY_IN_PROGRESS`:
  - wait briefly and retry with the same idempotency key, or poll via a domain-specific status endpoint if available.

## Example: PATCH /v1/me with idempotency

```bash
curl -sS \
  -H "Authorization: Bearer <access-token>" \
  -H "Idempotency-Key: 2fa85f64-5717-4562-b3fc-2c963f66afa6" \
  -H "Content-Type: application/json" \
  -X PATCH "http://localhost:4000/v1/me" \
  -d '{"profile":{"displayName":"Dante"}}'
```
