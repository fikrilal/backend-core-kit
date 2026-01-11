# Backlog (Next Practical Work)

This is a WIP tracker for near-term backlog items that improve production readiness and enterprise alignment.

## 1) Admin audit log read API

- Endpoint: `GET /v1/admin/audit/user-role-changes`
- Data source: `UserRoleChangeAudit`
- Capabilities:
  - Cursor pagination (consistent with existing list-query patterns)
  - Filters: `actorUserId`, `targetUserId`, `oldRole`, `newRole`, `since`, `until`
  - Sort: `createdAt desc` (tie-breaker `id desc`)
- Notes:
  - Requires admin RBAC + DB-hydrated principal (no token-embedded roles)
  - Response envelope `{ data, meta }`, RFC7807 errors, OpenAPI snapshot + Spectral passing

## 2) User suspension / disable (control-plane primitive)

- Schema:
  - Add `UserStatus` enum: `ACTIVE | SUSPENDED`
  - Add `User.status` default `ACTIVE`
- Admin API:
  - `PATCH /v1/admin/users/:userId/status` (idempotent; optional `Idempotency-Key`)
- Enforcement:
  - Block auth/refresh for suspended users (deny before side effects)
  - Revoke refresh tokens (and optionally sessions) on suspend to reduce risk window
- Notes:
  - Stable error code for suspended users (e.g. `AUTH_USER_SUSPENDED`)

## 3) Session metadata hardening (security + UX)

- Schema (Session):
  - Add: `ip`, `userAgent`, `lastSeenAt`
- Runtime:
  - Set `ip/userAgent` on session creation (login/register)
  - Update `lastSeenAt` on refresh (and/or on authenticated requests)
- API:
  - Extend `GET /v1/me/sessions` to return these fields (still lists active + revoked + expired)
- Notes:
  - Enables “suspicious session” detection and better account security UX

## 4) Observability for jobs + email (traceability end-to-end)

- Goal: correlate `traceId` across HTTP → enqueue → worker → external calls (Resend).
- Work:
  - Add OTel spans around BullMQ job enqueue + processing
  - Add spans/metrics for email send attempts + failures (with stable error codes)
  - Ensure logs include `traceId`/`requestId` and avoid PII/secrets

## 5) Auth abuse protection (rate limiting + anti-enumeration)

- Add Redis-backed throttles for:
  - `POST /v1/auth/password/login`
  - `POST /v1/auth/password/reset/request`
  - `POST /v1/auth/email/verification/resend`
- Requirements:
  - No user enumeration (responses should be consistent)
  - Stable error codes for throttling (e.g. `RATE_LIMITED`)
  - Document client guidance (mobile retry/backoff behavior)
