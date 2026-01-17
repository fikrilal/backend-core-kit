# High-ROI Core Kit Backlog (Infra + Always-Needed Endpoints)

Context: Current core-kit state already includes password + Google OIDC auth, session management, RBAC (static + DB-hydrated), idempotency keys, email (Resend), push (FCM), object storage (S3/R2), admin user mgmt + audits, health/readiness, and a committed OpenAPI snapshot.

Goal: Close the highest-leverage “production baseline” gaps and add any missing always-present endpoints/infrastructure.

---

## P0 — Infra: Metrics (close observability spec gap)

Problem:
- `docs/standards/observability.md` requires metrics, but the implementation currently exports traces only.

Proposal:
- Add OTEL metrics export via OTLP (Grafana Cloud-compatible).
- Keep it environment-driven and off by default unless configured (similar to traces).
- Provide a minimal baseline metrics set:
  - HTTP request count + duration histogram by route/status.
  - BullMQ job count + duration histogram by queue/jobName/outcome.
  - Optionally: rate-limit/idempotency hit counts.

Design notes:
- Prefer OTLP export (consistent with existing traces approach).
- Avoid adding `/metrics` unless Prometheus scraping is explicitly a target; OTLP-only is acceptable for Grafana Cloud.

Acceptance criteria:
- Metrics can be enabled/disabled via env config.
- No secrets/PII in metric labels (avoid email/user identifiers).
- Docs updated: `docs/standards/observability.md`, and `env.example` updated if new env keys are introduced.

---

## P0 — Infra: Reliability timeouts (close reliability spec gap)

Problem:
- `docs/standards/reliability.md` expects explicit timeouts; current platform services rely on defaults (HTTP server, Redis client, DB).

Proposal:
- Introduce explicit, validated timeout configuration (env + `libs/platform/config/env.validation.ts`) for:
  1) HTTP server timeouts (request/headers/keep-alive) and payload size cap(s) where appropriate.
  2) Redis timeouts and retry bounds (connect timeout, command timeout if supported, max retries per request).
  3) DB “safety timeout” strategy (at minimum: documented; optionally enforced via Postgres `statement_timeout`).

Design notes:
- Must be production-safe defaults; dev/test should be ergonomic (but not infinite).
- Prefer “bounded retries + explicit timeouts” over silent hangs.

Acceptance criteria:
- Timeouts are configurable and validated at startup.
- `env.example` updated for any new keys.
- Docs updated: `docs/standards/reliability.md` (+ reference from `docs/standards/security.md` if relevant).

---

## P0 — Endpoint: Admin audit for user status changes (quick win)

Problem:
- `UserStatusChangeAudit` is written in persistence, but there is no read endpoint in the admin audit API surface.

Proposal:
- Add `GET /v1/admin/audit/user-status-changes`.
- Same conventions as the existing audit endpoints:
  - RBAC-protected admin route (`@RequirePermissions(...)` + `@UseDbRoles()`).
  - List-query support (limit/cursor/sort/filter) consistent with `libs/shared/list-query`.
  - Response envelope `{ data, meta }`.

Acceptance criteria:
- OpenAPI updated and snapshot committed (`docs/openapi/openapi.yaml`).
- E2E or integration coverage aligned with existing admin audit endpoints.

---

## P1 — Infra: Enrich request logs with principal identifiers

Problem:
- Observability standard calls out `userId/sessionId`, but request logs don’t automatically include them.

Proposal:
- When `req.principal` exists, include `userId` + `sessionId` (and maybe `role`) in request logs in a safe, consistent way.

Acceptance criteria:
- No PII leakage (no emails, tokens).
- Works for both API and worker logging contexts where applicable.

---

## P1 — Infra: HTTP security hardening toggles (optional baseline)

Proposal:
- Add explicit, env-driven support for:
  - CORS configuration.
  - Security headers (helmet-equivalent).
  - Request body size limits (tighten for auth endpoints).

Note:
- Some deployments prefer handling this at the edge; keep toggles explicit (no hidden behavior).

---

## Recommended implementation order

1) Metrics (P0)
2) Timeouts (P0)
3) Admin audit: user status changes (P0)
4) Log enrichment (P1)
5) HTTP security toggles (P1)

