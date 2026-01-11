# Password Change — `POST /v1/auth/password/change`

This document describes the semantics and safety guarantees for changing the current user’s password.

## Endpoint

- Method: `POST`
- Path: `/v1/auth/password/change`
- Auth: `Authorization: Bearer <access-token>` (required)

## Request body

```json
{
  "currentPassword": "<string>",
  "newPassword": "<string>"
}
```

Notes:

- `newPassword` must satisfy `AUTH_PASSWORD_MIN_LENGTH`.
- `newPassword` must be different from `currentPassword`.

## Response

- `204 No Content` on success

The API does not return tokens from this endpoint.

## Session / token impact (enterprise-aligned)

On success, the backend:

- updates the user’s password hash
- revokes **all other sessions** for that user (and their refresh tokens)
- keeps the **current session** active

Important:

- Existing access tokens are **not** invalidated immediately. They remain valid until expiry.
- Revoking sessions prevents other devices from refreshing their access tokens (refresh returns `AUTH_SESSION_REVOKED`).

## Idempotency (recommended for clients)

Clients should send an `Idempotency-Key` for safer retries (timeouts / unknown outcomes):

- Header: `Idempotency-Key: <uuid>`
- Replay header: `Idempotency-Replayed: true`
- Conflicts:
  - `409 IDEMPOTENCY_IN_PROGRESS` when another identical request is still processing
  - `409 CONFLICT` when the same key is reused with a different payload

Example:

```bash
curl -sS \
  -H "Authorization: Bearer <access-token>" \
  -H "Idempotency-Key: 2fa85f64-5717-4562-b3fc-2c963f66afa6" \
  -H "Content-Type: application/json" \
  -X POST "http://localhost:4000/v1/auth/password/change" \
  -d '{"currentPassword":"old","newPassword":"new"}' \
  -i
```

## Error codes

- `401 UNAUTHORIZED`: missing/invalid access token (or subject no longer exists)
- `400 VALIDATION_FAILED`: invalid input / password policy violation
- `400 AUTH_CURRENT_PASSWORD_INVALID`: current password does not match
- `409 AUTH_PASSWORD_NOT_SET`: account has no password credential (e.g., OIDC-only account)
- `409 IDEMPOTENCY_IN_PROGRESS`: duplicate idempotent request still processing
- `409 CONFLICT`: idempotency key reused with a different payload
