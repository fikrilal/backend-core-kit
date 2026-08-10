# Auth Password Capability Split

Date: 2026-08-08  
Owner: Codex  
Status: completed  
Risk class: high  
Related issue/PR: N/A

## Objective

Perform Phase 5 of the auth capability split: move password register/login/
change handlers and their DTOs into `libs/features/auth/password` without
changing public API behavior, endpoint paths, operation IDs, token semantics,
login timing behavior, or rate limiting.

## Constraints

- Keep `AuthModule` as the public module imported by `apps/api`.
- Keep `AuthPasswordAuthService` in `app/` — it is app-layer (uses `Clock`,
  ports, `AuthSessionLifecycleService`) and is delegated to by `AuthService`;
  moving it would break the `app/` -> capability boundary rule.
- Keep existing `AuthError` and `AuthErrorFilter` behavior.
- Keep Prisma auth repository facade intact.
- Do not change endpoint paths, operation IDs, response status codes,
  error-code metadata, or request schemas.
- Do not change login timing behavior, dummy-password-hash verification, or
  rate limiting.
- Do not change Prisma schema or migrations.
- Do not commit or push.

## Acceptance Criteria

1. `POST /v1/auth/password/register`, `POST /v1/auth/password/login`, and
   `POST /v1/auth/password/change` are owned by a controller in
   `libs/features/auth/password/`.
2. Password DTOs live under `libs/features/auth/password/`.
3. Existing endpoint paths, operation IDs, status codes, DTO schemas, tags, and
   error codes are unchanged.
4. `AuthController` retains only OIDC exchange/connect handlers.
5. `AuthModule` provider/controller wiring remains explicit and readable.
6. Login timing behavior and rate limiting are covered by runtime e2e evidence.
7. OpenAPI generate/check/lint pass.

## Implementation Checklist

- [x] Map current password auth handlers, DTOs, and rate limiter.
- [x] Move password DTOs and password policy into `password/`.
- [x] Create `PasswordAuthController` (register/login/change).
- [x] Strip password handlers from `AuthController` (keep OIDC only).
- [x] Remove moved DTOs from `auth.dto.ts` and delete `password-policy.ts`.
- [x] Update `AuthModule` controller imports/registration.
- [x] Run targeted verification + runtime e2e evidence.

## Decision Log

- 2026-08-08: Keep `AuthPasswordAuthService` in `app/` -> avoids an
  `app/` -> `password/` dependency violation; only the controller and DTOs
  move into the capability folder.
- 2026-08-08: `PasswordAuthController` keeps delegating to `AuthService`
  (which delegates to `AuthPasswordAuthService`) and keeps the
  `AuthEmailVerificationJobs` enqueue + `UsersService.getMe` merge, matching
  the original `AuthController` behavior exactly.
- 2026-08-08: Move `PasswordRegisterRequestDto`, `PasswordLoginRequestDto`,
  `ChangePasswordRequestDto`, and the `AUTH_PASSWORD_MIN_LENGTH` policy into
  `password/password-auth.dto.ts`; keep `AuthResultWithMeEnvelopeDto` in
  `auth.dto.ts` (shared with OIDC exchange).

## Verification

Commands to run:

```bash
npm run typecheck
npm run deps:check
npm run format:check
npm run lint
npm test (unit)
NODE_ENV=test npx jest --config test/jest-e2e.json --runInBand --runTestsByPath test/auth
NODE_ENV=development npm run openapi:generate
NODE_ENV=development npm run openapi:check
npm run openapi:lint
```

Completed:

```bash
npm run typecheck: passed
npm run deps:check: passed (no dependency violations, 309 modules, 758 deps)
npm run format:check: passed
npm run lint: passed
npm test: 47 suites passed, 5 pre-existing platform failures (env issue)
test/auth e2e (19 tests): passed, including register, login,
  change-password (idempotency replay), invalid credentials, rate limiting
test/auth-me, auth-admin, auth-account-deletion e2e (34 tests): passed
npm run openapi:generate: passed (snapshot updated: password endpoints
  reordered only)
npm run openapi:check: passed
npm run openapi:lint: passed
```

## Runtime Evidence

Full auth e2e suites passed against real Postgres/Redis/MinIO (docker
`lamara-backend-*`), proving register, login (timing-safe dummy hash, rate
limiting), change-password (session revocation + idempotency replay), OIDC
exchange/connect, refresh, logout, email verification, and account-deletion
flows are behavior-preserving after the moves.

## Environment Notes (pre-existing, not caused by this phase)

- The shell exports `NODE_ENV=production`, which makes `loadDotEnvOnce` skip
  `.env` and forces Prisma SSL + prod boot. OpenAPI generation and e2e/int runs
  must set `NODE_ENV=development` or `NODE_ENV=test` explicitly.
- 5 unit suites in `libs/platform/` (email, redis, storage, fcm-push,
  access-token-verifier) fail on the pre-change baseline too: shell env vars
  leak into `ConfigService` (which reads `process.env` via fallback when specs
  pass `{}` stubs). Out of scope for this phase.

## Risks And Mitigations

- Risk: login timing/dummy-hash/rate-limiting changes.
  - Mitigation: no semantic edits; controller delegates through `AuthService`
    to the same `AuthPasswordAuthService`; e2e covers invalid credentials and
    rate limiting.
- Risk: route paths or tags change.
  - Mitigation: keep route decorators equivalent; OpenAPI diff shows only
    reordering, paths/operationIds/tags/error codes identical.
- Risk: `AuthController` losing password handlers breaks OIDC routes.
  - Mitigation: OIDC handlers untouched; verified by e2e.
- Risk: DTO moves change the API schema.
  - Mitigation: moved password DTOs only; shared envelope DTOs stay;
    OpenAPI schema refs unchanged.

## Completion Notes

- Extracted password auth into `libs/features/auth/password/`:
  - `password-auth.controller.ts` (register/login/change)
  - `password-auth.dto.ts` (password register/login/change DTOs + policy)
- `AuthController` now owns only OIDC exchange/connect.
- Removed password DTOs from `auth.dto.ts` and deleted
  `infra/http/dtos/password-policy.ts`.
- Kept `AuthPasswordAuthService` in `app/` (boundary constraint).
- OpenAPI snapshot updated (ordering-only change).

## Follow-Ups

- [ ] Phase 6 OIDC capability split.
- [ ] Phase 7 shared cleanup: reassess whether `AuthService` should remain as a
      facade (it now delegates only register/login/change-password + OIDC).
