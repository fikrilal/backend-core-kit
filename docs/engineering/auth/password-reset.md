# Password Reset (Auth)

This document covers the **password reset** flow in this kit:

- API: `reset/request` enqueues a BullMQ job (no account enumeration)
- Worker: issues a one-time token and sends a **link-based** reset email (Resend)
- API: `reset/confirm` consumes the token, updates password, and revokes sessions

## Flow

1. Client calls `POST /v1/auth/password/reset/request`
2. API rate limits and then:
   - returns `204` even if the email does not exist (prevents account enumeration)
   - best-effort enqueues `auth.sendPasswordResetEmail` for existing users
3. Worker consumes the job and:
   - creates a `PasswordResetToken` row (hashed token + expiry)
   - emails a reset link to the user via `EmailService` (Resend)
4. User opens the frontend link, which collects a new password and calls
   `POST /v1/auth/password/reset/confirm`
5. API validates token + password policy, then:
   - updates (or creates) `PasswordCredential`
   - revokes **all** user sessions + refresh tokens

## Link format (frontend-owned)

The worker generates:

`{PUBLIC_APP_URL}/reset-password?token=<raw-token>`

The frontend is responsible for:

- reading the `token` query parameter
- posting `{ token, newPassword }` to `POST /v1/auth/password/reset/confirm`

## Token storage model

- Raw reset token is **never stored** in Postgres.
- Only `tokenHash = sha256(token)` is stored in `PasswordResetToken`.
- Tokens have:
  - `expiresAt` (default: 30 minutes)
  - `usedAt` (set once consumed)
  - `revokedAt` (unused tokens are revoked after a successful reset)

## Configuration

Required to deliver reset emails:

- `DATABASE_URL` (Postgres)
- `REDIS_URL` (BullMQ)
- `RESEND_API_KEY` + `EMAIL_FROM` (Resend)
- `PUBLIC_APP_URL` (frontend base URL)

Optional:

- `AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS` (default: `1800` / 30m)
- `AUTH_PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS` (default: `60`)

## Job identifiers

- Queue: `emails`
- Job: `auth.sendPasswordResetEmail`

## HTTP endpoints

### Request password reset (public)

- `POST /v1/auth/password/reset/request`
- Body: `{ "email": "user@example.com" }`
- Responses:
  - `204` on accepted (even if the email is unknown)
  - `429 RATE_LIMITED` when called too frequently

### Confirm password reset (public)

- `POST /v1/auth/password/reset/confirm`
- Body: `{ "token": "<token>", "newPassword": "<new-password>" }`
- Responses:
  - `204` on success
  - `400 AUTH_PASSWORD_RESET_TOKEN_INVALID` when token is unknown/used/revoked
  - `400 AUTH_PASSWORD_RESET_TOKEN_EXPIRED` when token is expired

## Reliability & semantics

- Delivery is **at-least-once** (BullMQ retries), so duplicate emails are possible.
- A successful reset revokes all sessions so refresh tokens stop working immediately.
