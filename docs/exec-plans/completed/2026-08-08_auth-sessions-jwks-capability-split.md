# Auth Sessions and JWKS Capability Split

Date: 2026-08-08  
Owner: Codex  
Status: completed  
Risk class: high  
Related issue/PR: N/A

## Objective

Perform Phase 4 of the auth capability split: move session list/revoke,
refresh, logout, and JWKS into `libs/features/auth/sessions` without changing
public API behavior, endpoint paths, operation IDs, token semantics, refresh
rotation, or reuse detection.

## Constraints

- Keep `AuthModule` as the public module imported by `apps/api`.
- Keep `AuthSessionLifecycleService` in `app/` — it is core shared app
  infrastructure used by `AuthPasswordAuthService`, `AuthOidcAuthService`, and
  the module DI graph. Moving it to `sessions/` would create an `app/` ->
  `sessions/` import, which the dependency-cruiser `feature-app-must-not-import-
infra-or-framework` rule forbids.
- Keep existing `AuthError` and `AuthErrorFilter` behavior.
- Keep Prisma auth repository facade intact.
- Do not change endpoint paths, operation IDs, response status codes,
  error-code metadata, or request schemas.
- Do not change refresh rotation, reuse detection, logout, or session
  revocation semantics.
- Do not change Prisma schema or migrations.
- Do not commit or push.

## Acceptance Criteria

1. `GET /v1/me/sessions`, `POST /v1/me/sessions/:sessionId/revoke`,
   `POST /v1/auth/refresh`, `POST /v1/auth/logout`, and
   `GET /.well-known/jwks.json` are owned by controllers in
   `libs/features/auth/sessions/`.
2. Sessions service, controller, DTOs, and JWKS controller live under
   `libs/features/auth/sessions/`.
3. Existing endpoint paths, operation IDs, status codes, DTO schemas, and error
   codes are unchanged.
4. `AuthService` no longer delegates refresh/logout/JWKS; controllers call
   `AuthSessionLifecycleService` directly.
5. `AuthModule` provider/controller wiring remains explicit and readable.
6. Refresh/logout/JWKS behavior is covered by runtime e2e evidence.
7. OpenAPI generate/check/lint pass.

## Implementation Checklist

- [x] Map current session lifecycle, refresh/logout, and JWKS handlers.
- [x] Move sessions service and DTO into `sessions/`.
- [x] Create `SessionsController` (list/revoke/refresh/logout) and
      `JwksController` in `sessions/`.
- [x] Remove `AuthService` refresh/logout/getPublicJwks pass-throughs.
- [x] Update `AuthModule` provider/controller imports and remove old files.
- [x] Update affected tests (deleted-user refresh spec).
- [x] Run targeted verification + runtime e2e evidence.

## Decision Log

- 2026-08-08: Keep `AuthSessionLifecycleService` in `app/` instead of moving it
  to `sessions/` -> avoids an `app/` -> `sessions/` dependency violation while
  still consolidating the session-facing controllers and DTOs under the
  capability folder.
- 2026-08-08: Point `SessionsController`, `JwksController`, and the refresh/
  logout handlers at `AuthSessionLifecycleService` directly and drop the
  `AuthService` pass-throughs -> `AuthService` keeps only register/login/oidc/
  change-password orchestration.
- 2026-08-08: Move `RefreshRequestDto` and `LogoutRequestDto` into
  `sessions/sessions.dto.ts` (session-specific); keep `AuthResultEnvelopeDto`
  in `auth.dto.ts` (shared with register/login/oidc).
- 2026-08-08 (review fix): Split the merged `SessionsController` into
  `MeSessionsController` (`@ApiTags('Users')`, me/sessions routes) and
  `AuthSessionsController` (`@ApiTags('Auth')`, auth/refresh + auth/logout
  routes). The merged controller had retagged refresh/logout as Users, which
  changed the OpenAPI contract; splitting restores the original Auth tag.

## Verification

Commands to run:

```bash
npm run typecheck
npm run deps:check
npm run format:check
npm run lint
npm test (unit)
NODE_ENV=development npm run prisma:migrate:deploy   # local DB setup (env issue)
NODE_ENV=test npx jest --config test/jest-e2e.json --runInBand --runTestsByPath test/auth
NODE_ENV=development npx jest --config test/jest-int.json --runInBand --runTestsByPath test
NODE_ENV=development npm run openapi:generate
NODE_ENV=development npm run openapi:check
npm run openapi:lint
```

Completed:

```bash
npm run typecheck: passed
npm run deps:check: passed (no dependency violations, 308 modules, 745 deps)
npm run format:check: passed
npm run lint: passed
npm test: 47 suites passed, 5 pre-existing failures (platform env issue, see
  below)
test/auth e2e (19 tests): passed, including register->refresh->logout->refresh,
  refresh token reuse detection, JWKS, session revoke
test/auth-me, auth-admin, auth-account-deletion e2e (34 tests): passed
test/auth-emails-worker, idempotency, rate-limiters, queue-smoke,
  push-worker, admin-last-admin int (25 tests): passed
npm run openapi:generate: passed (snapshot updated: refresh/logout/sessions
  endpoints reordered only)
npm run openapi:check: passed
npm run openapi:lint: passed
```

## Runtime Evidence

Full auth e2e + int suites passed against real Postgres/Redis/MinIO (docker
`lamara-backend-*`), proving refresh rotation, reuse detection, logout, session
revoke, JWKS, register/login/change-password, email verification, and
account-deletion flows are behavior-preserving after the moves.

## Environment Notes (pre-existing, not caused by this phase)

- The shell exports `NODE_ENV=production`, which makes `loadDotEnvOnce` skip
  `.env` and forces Prisma SSL + prod boot. OpenAPI generation and e2e/int runs
  must set `NODE_ENV=development` or `NODE_ENV=test` explicitly.
- The local docker Postgres had no `backend_core_kit` database until
  `npm run prisma:migrate:deploy` was run; int/e2e suites fail with
  `database "backend_core_kit" does not exist` otherwise.
- 5 unit suites in `libs/platform/` (email, redis, storage, fcm-push,
  access-token-verifier) fail on the pre-change baseline too: shell env vars
  leak into `ConfigService` (which reads `process.env` via fallback when specs
  pass `{}` stubs). Out of scope for this phase.

## Risks And Mitigations

- Risk: refresh rotation/reuse detection breaks after the move.
  - Mitigation: no semantic edits; controllers call the same lifecycle service;
    e2e covers register->refresh->logout->refresh and reuse detection.
- Risk: route paths change due to controller prefixing.
  - Mitigation: keep route decorators equivalent; OpenAPI diff shows only
    reordering, paths/operationIds/error codes identical.
- Risk: `AuthService` consumers break when pass-throughs are removed.
  - Mitigation: only the deleted-user refresh spec used `AuthService.refresh`;
    updated it to construct `AuthSessionLifecycleService` directly.
- Risk: `AuthResultEnvelopeDto`/refresh/logout DTO moves change the API schema.
  - Mitigation: moved session-specific DTOs only; `AuthResultEnvelopeDto` stays
    shared; OpenAPI schema refs unchanged.

## Completion Notes

- Extracted sessions into `libs/features/auth/sessions/`:
  - `sessions.controller.ts` (list/revoke/refresh/logout)
  - `sessions.service.ts` (moved `AuthSessionsService`)
  - `sessions.dto.ts` (sessions list/param DTOs + moved refresh/logout DTOs)
  - `jwks.controller.ts` (now injects `AuthSessionLifecycleService` directly)
- Removed `AuthService.refresh/logout/getPublicJwks` pass-throughs; controllers
  call `AuthSessionLifecycleService` directly.
- Kept `AuthSessionLifecycleService` in `app/` (boundary constraint).
- Removed old `app/auth-sessions.service.ts`, `infra/http/me-sessions.controller.ts`,
  `infra/http/dtos/me-sessions.dto.ts`, `infra/http/jwks.controller.ts`.
- OpenAPI snapshot updated (ordering-only change).

## Follow-Ups

- [ ] Phase 5 password auth capability split.
- [ ] Phase 7 shared cleanup: reassess whether `AuthService` should remain as a
      facade and whether `AuthSessionLifecycleService` can move once the
      `app/` -> capability boundary rules are reviewed.
