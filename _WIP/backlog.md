# Backlog (Next Practical Work)

This is a WIP tracker for near-term backlog items that improve production readiness and enterprise alignment.

## 1) Admin audit log: account deletion events (read API)

- Endpoint: `GET /v1/admin/audit/user-account-deletions`
- Data source: `UserAccountDeletionAudit`
- Design: `_WIP/admin-audit-user-account-deletions.md`
- Capabilities:
  - Cursor pagination (consistent with existing list-query patterns)
  - Filters: `actorUserId`, `targetUserId`, `action`, `traceId`, `since`, `until`
  - Sort: `createdAt desc` (tie-breaker `id desc`)
- Notes:
  - Requires admin RBAC + DB-hydrated principal (no token-embedded roles)
  - Response envelope `{ data, meta }`, RFC7807 errors, OpenAPI snapshot + Spectral passing

## 2) Session metadata hardening (security + UX)

Why this matters (production):

- Security: lets users spot suspicious sessions (“new device”, “unknown IP/UA”), and supports incident response (“which session was active when?”).
- UX: better sessions UI (device name + last active), and safer “revoke other sessions” flows without guessing.
- Ops: reduces support time when debugging auth complaints by correlating sessions to client context.

- Schema (Session):
  - Add: `ip`, `userAgent`, `lastSeenAt`
- Runtime:
  - Set `ip/userAgent` on session creation (login/register)
  - Update `lastSeenAt` on refresh (preferred) or throttled per-request (avoid DB hot writes)
- API:
  - Extend `GET /v1/me/sessions` to return these fields (still lists active + revoked + expired)
- Notes:
  - Treat IP/user-agent as PII; minimize logging and only expose to the account owner/admin.
  - IP correctness depends on `HTTP_TRUST_PROXY` when running behind a load balancer.

## 3) Worker trace propagation (HTTP → enqueue → worker)

- Goal: correlate `traceId` across HTTP → enqueue → worker (and onward to Resend/email).
- Notes:
  - We already inject `traceparent`/`tracestate` into job payload on enqueue.
  - Next: extract job trace context in workers so spans/logs link back to the originating request.

## 4) Newline hygiene (Windows/WSL interop)

- Add `.gitattributes` to enforce LF for repo files and stop CRLF churn/warnings.

---

## Recently completed (for context)

- Admin audit log: `GET /v1/admin/audit/user-role-changes`
- User suspension control-plane primitive (admin status patch + enforcement)
- Self-service account deletion (30-day grace, finalization worker, audits)
