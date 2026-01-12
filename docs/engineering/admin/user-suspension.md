# User Suspension (Admin)

This core kit supports **account suspension** for cases like abuse, compromised accounts, chargebacks, or policy violations.

Suspension is designed to be:

- **Enterprise-aligned**: centralized admin action + audit trail.
- **Safe by default**: suspended users cannot mint new tokens.
- **Minimal perf impact**: no mandatory per-request DB check for all routes (see notes).

## Data model

User status is stored on the `User` row:

- `status`: `ACTIVE | SUSPENDED`
- `suspendedAt`: timestamp (set when suspended)
- `suspendedReason`: optional string (admin-only note)

Every change is written to an audit table:

- `UserStatusChangeAudit`:
  - `actorUserId`, `actorSessionId`
  - `targetUserId`
  - `oldStatus`, `newStatus`
  - `reason?`
  - `traceId`
  - `createdAt`

## Admin API

### PATCH `/v1/admin/users/:userId/status`

Sets user status:

- Request body:
  - `status`: `ACTIVE | SUSPENDED`
  - `reason?`: `string | null`
- Response: `{ data: AdminUserDto }`
- Requires:
  - `admin:access`
  - `users:status:write`

#### Last-admin protection

If the target user is the **last active admin**, suspension is blocked:

- `409 ADMIN_CANNOT_SUSPEND_LAST_ADMIN`

“Active admin” means: `role = ADMIN` and `status = ACTIVE`.

#### Side effects on suspension

When transitioning `ACTIVE -> SUSPENDED`, the backend also:

- Revokes all sessions for the user (best-effort reduction of the risk window)
- Revokes all refresh tokens for the user

## Auth behavior (403 AUTH_USER_SUSPENDED)

When `User.status = SUSPENDED`, these flows return:

- `403 AUTH_USER_SUSPENDED`

Flows:

- Password login (`POST /v1/auth/password/login`)
- OIDC exchange (`POST /v1/auth/oidc/exchange`)
- Refresh (`POST /v1/auth/refresh`)

This is intentional so clients can distinguish:

- `401` → token missing/invalid/expired (refresh may help)
- `403 AUTH_USER_SUSPENDED` → account is blocked (refresh will not help)

## Admin endpoint behavior (immediate block)

All `/v1/admin/*` endpoints are **DB-hydrated** on every request. This means:

- Role promotions/demotions take effect immediately.
- Suspended accounts are blocked immediately (even if they still have an unexpired access token).

## Notes / limitations

- Non-admin endpoints do not currently perform a mandatory DB lookup on every request for `User.status`. If a suspended user still has an **unexpired access token**, they may retain access to non-admin routes until the access token TTL elapses.
- Suspension revokes sessions + refresh tokens to prevent minting new access tokens.

If you need “suspension blocks all routes immediately”, add a dedicated per-request revocation/status check (with caching) and document the perf tradeoffs.
