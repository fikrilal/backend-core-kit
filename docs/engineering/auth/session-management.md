# Session Management (Auth)

This document covers **current-user session management**:

- list sessions (active/revoked/expired)
- revoke a session (logout a device)

## Important semantics

- Revoking a session revokes its **refresh tokens immediately** (so refresh fails).
- Access tokens are **not** globally revoked in this kit by default, so an already-issued access
  token may remain valid until `exp` even if its underlying session is revoked.

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
