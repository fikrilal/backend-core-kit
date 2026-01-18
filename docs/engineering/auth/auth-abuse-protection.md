# Auth Abuse Protection

This document defines the **baseline abuse protection** for auth-related endpoints in this kit.

Goals:

- reduce brute-force risk on password login
- reduce email spam risk (password reset + verification resend)
- avoid account enumeration
- keep behavior predictable for clients (mobile/web)

## Principles

- **Deny by default** when an endpoint is being abused: return `429` with RFC7807 body and `code: RATE_LIMITED`.
- **No account enumeration**: do not reveal whether an email exists.
- **No PII in Redis keys**: emails/IPs are hashed before being used as Redis keys.
- **Redis is required in staging/production** (see `libs/platform/config/env.validation.ts`), so these limits are always active in production-like environments.
- **Correct client IP is required for IP-based limits**: when deployed behind a proxy/load balancer, configure `HTTP_TRUST_PROXY=true` so `req.ip` is derived from `X-Forwarded-For` (only safe when the app is not directly reachable from the internet).

## Endpoints and policies

### Password login (`POST /v1/auth/password/login`)

Threats:

- credential stuffing and brute force attempts

Controls:

- Rate limit by **email** and by **IP** (independent buckets).
- On failed login:
  - increment failure counters
  - set a block key once the failure threshold is hit
- On successful login:
  - clear failure counters for that email/IP
- Timing hardening:
  - the API performs a password hash verification even when the user does not exist (dummy hash) to reduce timing-based enumeration.

Config (defaults):

- `AUTH_LOGIN_MAX_ATTEMPTS` (default `10`)
- `AUTH_LOGIN_WINDOW_SECONDS` (default `60`)
- `AUTH_LOGIN_BLOCK_SECONDS` (default `900` / 15m)

### Password reset request (`POST /v1/auth/password/reset/request`)

Threats:

- password reset email spam and abuse
- account enumeration via different responses

Controls:

- Always return `204` for well-formed requests, even when the email does not exist.
- Rate limit:
  - per **email cooldown** (prevents repeated requests to the same target)
  - per **IP window/block** (prevents spraying many different emails from one IP)

Config (defaults):

- `AUTH_PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS` (default `60`)
- `AUTH_PASSWORD_RESET_REQUEST_IP_MAX_ATTEMPTS` (default `20`)
- `AUTH_PASSWORD_RESET_REQUEST_IP_WINDOW_SECONDS` (default `300` / 5m)
- `AUTH_PASSWORD_RESET_REQUEST_IP_BLOCK_SECONDS` (default `900` / 15m)

### Verification email resend (`POST /v1/auth/email/verification/resend`)

Threats:

- verification email spam
- abuse of the email provider integration

Controls:

- If the user is already verified, return `204` (idempotent behavior).
- Rate limit:
  - per **user cooldown**
  - per **IP window/block** (prevents a single IP from spamming many users)

Config (defaults):

- `AUTH_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS` (default `60`)
- `AUTH_EMAIL_VERIFICATION_RESEND_IP_MAX_ATTEMPTS` (default `30`)
- `AUTH_EMAIL_VERIFICATION_RESEND_IP_WINDOW_SECONDS` (default `300` / 5m)
- `AUTH_EMAIL_VERIFICATION_RESEND_IP_BLOCK_SECONDS` (default `900` / 15m)

## Error contract

On rate limiting:

- HTTP: `429`
- Content-Type: `application/problem+json`
- Header: `Retry-After: <seconds>` (best-effort; derived from remaining Redis TTL)
- Body includes:
  - `code: RATE_LIMITED`
  - `traceId` (and `X-Request-Id` header)

Client guidance:

- treat `429` as a hard stop: **do not retry aggressively**
- show a user-friendly message (“Try again later”)
- use exponential backoff with jitter if retrying is necessary

## Implementation pointers

- Login limiter: `libs/features/auth/infra/rate-limit/redis-login-rate-limiter.ts`
- Reset request limiter: `libs/features/auth/infra/rate-limit/redis-password-reset-rate-limiter.ts`
- Verification resend limiter: `libs/features/auth/infra/rate-limit/redis-email-verification-rate-limiter.ts`

## Future improvements

- Improve `Retry-After` precision for complex cases (e.g. multiple concurrent limiters).
