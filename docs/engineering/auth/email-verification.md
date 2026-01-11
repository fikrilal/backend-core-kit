# Email Verification (Auth)

This document covers the **verify-email delivery path** in this kit:

- API: `register` enqueues a BullMQ job
- Worker: issues a verification token and sends the email (Resend)

## Flow

1. Client calls `POST /v1/auth/password/register`
2. API creates the user + issues access/refresh tokens
3. API best-effort enqueues `auth.sendVerificationEmail` on the `emails` queue
   - Enqueue failures are logged, but registration still succeeds
4. Worker consumes the job and:
   - Skips if the user is missing or already verified
   - Creates an `EmailVerificationToken` row (hashed token + expiry)
   - Sends the raw token to the user via `EmailService` (Resend)

## Token storage model

- Raw verification token is **never stored** in Postgres.
- Only `tokenHash = sha256(token)` is stored in `EmailVerificationToken`.
- Tokens have:
  - `expiresAt` (configurable TTL)
  - `usedAt` (set once the token is consumed)
  - `revokedAt` (reserved for future admin/security operations)

## Configuration

Required to actually deliver emails:

- `DATABASE_URL` (Postgres)
- `REDIS_URL` (BullMQ)
- `RESEND_API_KEY` + `EMAIL_FROM` (Resend)

Optional:

- `AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS` (default: `86400` / 24h)

## Job identifiers

- Queue: `emails`
- Job: `auth.sendVerificationEmail`

## Reliability & semantics

- Email delivery is treated as **at-least-once** (BullMQ retries), so duplicate emails are possible.
- This design allows multiple valid tokens per user until they expire or are used.

## Next steps (feature completion)

To complete the verify-email feature, implement an endpoint that:

- accepts the raw token
- hashes it and looks up `EmailVerificationToken.tokenHash`
- validates `expiresAt`, `usedAt`, `revokedAt`
- sets `User.emailVerifiedAt` and `EmailVerificationToken.usedAt`
