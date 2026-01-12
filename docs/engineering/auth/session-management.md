# Session Management (Auth)

This document covers **current-user session management**:

- list sessions (active/revoked/expired)
- revoke a session (logout a device)

## Important semantics

- Revoking a session revokes its **refresh tokens immediately** (so refresh fails).
- Access tokens are **not** globally revoked in this kit by default, so an already-issued access
  token may remain valid until `exp` even if its underlying session is revoked.
- Session metadata:
  - `lastSeenAt` is updated on **successful refresh**.
  - `ip` and `userAgent` are best-effort “last seen” values (captured on session creation and
    refreshed on token refresh when available).
  - IP accuracy depends on `HTTP_TRUST_PROXY` when running behind a load balancer.

## Endpoints

### List sessions (authenticated)

- `GET /v1/me/sessions`
- Requires: `Authorization: Bearer <access-token>`
- Pagination: cursor-based (`limit`, `cursor`) with stable sorting

Response (enveloped):

```json
{
  "data": [
    {
      "id": "…",
      "deviceId": "device-a",
      "deviceName": "iPhone 15",
      "ip": "203.0.113.10",
      "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
      "lastSeenAt": "2026-01-10T12:40:00.000Z",
      "createdAt": "2026-01-10T12:34:56.789Z",
      "expiresAt": "2026-02-10T12:34:56.789Z",
      "revokedAt": null,
      "current": true,
      "status": "active"
    }
  ],
  "meta": { "limit": 25, "hasMore": false }
}
```

`status` is computed server-side:

- `active`: `revokedAt == null` and `expiresAt > now`
- `expired`: `revokedAt == null` and `expiresAt <= now`
- `revoked`: `revokedAt != null`

### Revoke a session (authenticated)

- `POST /v1/me/sessions/:sessionId/revoke`
- Requires: `Authorization: Bearer <access-token>`
- Idempotent:
  - If already revoked, returns `204`.
  - If not found (for this user), returns `404 NOT_FOUND`.

## Notes for clients

- To “log out the current device”, use the refresh-token based logout endpoint:
  - `POST /v1/auth/logout`
- To “log out other devices”, revoke their sessions via `POST /v1/me/sessions/:sessionId/revoke`.

## Privacy notes

- `ip` and `userAgent` are treated as PII. They are returned only to the account owner (and should
  not be logged in full in normal request logs).
