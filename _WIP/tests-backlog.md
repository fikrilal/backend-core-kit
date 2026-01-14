# Testing Backlog (Core Kit)

Reference: `docs/standards/testing-strategy.md` (pyramid + contract gates).

## Current baseline (FYI)

Coverage snapshot (from `coverage/lcov-report/index.html`):

- Statements: **15.22%** (792/5202)
- Branches: **13.76%** (292/2122)
- Functions: **14.85%** (104/700)
- Lines: **15.78%** (723/4581)

Biggest gaps by folder (high-level): `apps/*` (bootstrap/worker), `libs/platform/auth/*`, `libs/platform/http/*` (filters/interceptors), `libs/platform/storage/*`, job processors.

## P0 — Security + contract regressions

- [ ] **[unit]** `libs/platform/auth/access-token-verifier.service.ts`: issuer/audience enforcement, `kid` selection, clock skew, JWKS fetch failures → stable 401 vs 503 mapping.
- [ ] **[unit]** `libs/platform/auth/access-token.guard.ts`: principal extraction invariants (`sub`, `sid`, `roles`, `email_verified`) and “deny on missing/invalid claims”.
- [ ] **[unit]** `libs/platform/rbac/rbac.guard.ts`: metadata merge semantics (controller-level + handler-level), dedupe/normalize, and explicit bypass (`@Public()`, `@SkipRbac()`).
- [ ] **[unit]** `libs/platform/rbac/db-role-hydrator.service.ts`: “deny-by-default” for unknown roles + DB role hydration behavior (esp. `/v1/admin/*`).
- [ ] **[int]** `libs/platform/http/idempotency/idempotency.service.ts`: redis-backed begin/end, concurrency behavior, replay header (`Idempotency-Replayed`), TTL expiry.
- [ ] **[e2e]** “contract shape smoke” for new endpoints: assert `{ data, meta? }` on success + RFC7807 problem-details on failure for at least one route per feature (auth/users/admin).

## P1 — Infra integration (real deps)

- [x] **[e2e]** Object storage happy path (MinIO): presign PUT → upload bytes → `headObject` → finalize. Include 409 cases (missing object, size mismatch, content-type mismatch).
- [x] **[int]** Job processing invariants (BullMQ worker):
  - [x] push worker: revoked/expired session is skipped; invalid token clears only if `WHERE pushToken = <token>` matches.
  - [x] email workers: disabled provider is a no-op; enqueue payloads are validated (no secrets in job data).
- [x] **[int]** Rate limiters (Redis): login, password reset, email verify resend, profile-image upload. Assert 429 + `RATE_LIMITED` + key TTL behavior.
- [x] **[e2e]** Session/security invariants in persistence:
  - refresh token reuse detection revokes the session.
  - password change revokes other sessions but preserves current session.
- [x] **[int]** Admin role invariants under concurrent writes:
  - “last admin cannot be demoted/suspended/deleted” remains safe under concurrency (transaction isolation + retry paths).

## P2 — Unit coverage for pure logic (cheap, high ROI)

- [ ] **[unit]** `libs/platform/http/errors/*`: problem-details mapping for known exceptions → stable `code` + `traceId`.
- [ ] **[unit]** `libs/shared/list-query/*`: expand edge cases (repeated params, max fields exceeded, invalid operators, mixed cursor+offset rules if applicable).
- [ ] **[unit]** Audit log shaping/mappers: role change events + account deletion events are deterministic, PII-minimized, and filterable.
- [ ] **[unit]** Email template payload shaping: verify we never embed secrets in URLs; only opaque one-time tokens.

## P3 — Observability + “kit correctness”

- [ ] **[e2e]** `X-Request-Id` propagation: every non-2xx response includes `traceId == X-Request-Id` (representative routes).
- [ ] **[int]** Trace propagation (HTTP → enqueue → worker): job data includes `traceId`; worker spans/logs attach it (assert via captured logger output or OTEL test exporter).
- [ ] **[meta]** “gates stay honest”: add a lightweight CI check that fails on OpenAPI drift (`npm run openapi:check`) + boundary violations (`npm run deps:check`) for a known-bad fixture (optional; only if we want to test the gates themselves).
