# Auth OIDC Capability Split

Date: 2026-08-08  
Owner: Codex  
Status: completed  
Risk class: high  
Related issue/PR: N/A

## Objective

Perform Phase 6 of the auth capability split: move OIDC exchange/connect
handlers and DTOs into `libs/features/auth/oidc` without changing public API
behavior, endpoint paths, operation IDs, account-linking semantics, or
idempotency.

## Constraints

- Keep `AuthModule` as the public module imported by `apps/api`.
- Keep `AuthOidcAuthService` in `app/` — it is app-layer (uses `Clock`, ports,
  `AuthSessionLifecycleService`); moving it would break the `app/` -> capability
  boundary rule.
- Keep `GoogleOidcIdTokenVerifier` in `infra/security/` per the roadmap.
- Keep existing `AuthError` and `AuthErrorFilter` behavior.
- Keep Prisma auth repository facade intact.
- Do not change endpoint paths, operation IDs, response status codes,
  error-code metadata, tags, or request schemas.
- Do not change OIDC account-linking, provider-identity-uniqueness, or
  idempotency behavior.
- Do not change Prisma schema or migrations.
- Do not commit or push.

## Acceptance Criteria

1. `POST /v1/auth/oidc/exchange` and `POST /v1/auth/oidc/connect` are owned by a
   controller in `libs/features/auth/oidc/`.
2. OIDC DTOs live under `libs/features/auth/oidc/`.
3. Existing endpoint paths, operation IDs, status codes, DTO schemas, tags, and
   error codes are unchanged.
4. `AuthController` is deleted (OIDC was its last handler).
5. `AuthModule` provider/controller wiring remains explicit and readable.
6. OIDC exchange/connect behavior is covered by runtime e2e evidence.
7. OpenAPI generate/check/lint pass (snapshot unchanged).

## Implementation Checklist

- [x] Map current OIDC handlers, DTOs, and verifier.
- [x] Create `OidcController` (exchange/connect) and `oidc.dto.ts`.
- [x] Delete `AuthController` (empty after OIDC move).
- [x] Remove OIDC DTOs from `auth.dto.ts`.
- [x] Update `AuthModule` controller imports/registration.
- [x] Run targeted verification + runtime e2e evidence.

## Decision Log

- 2026-08-08: Keep `AuthOidcAuthService` in `app/` -> avoids an
  `app/` -> `oidc/` dependency violation; only the controller and DTOs move
  into the capability folder.
- 2026-08-08: Delete `AuthController` entirely -> OIDC was its last remaining
  handler; `auth.module.ts` registers `OidcController` in its place.
- 2026-08-08: Move `OidcExchangeRequestDto` and `OidcConnectRequestDto` into
  `oidc/oidc.dto.ts`; `auth.dto.ts` keeps only the shared result-envelope DTOs
  (`AuthUserDto`, `AuthResultDto`, `AuthResultEnvelopeDto`,
  `AuthResultWithMeDto`, `AuthResultWithMeEnvelopeDto`).

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
npm run deps:check: passed (no dependency violations, 310 modules, 759 deps)
npm run format:check: passed
npm run lint: passed
npm test: 47 suites passed, 5 pre-existing platform failures (env issue)
test/auth e2e (53 tests): passed, including OIDC exchange/connect
npm run openapi:generate: passed (snapshot unchanged)
npm run openapi:check: passed
npm run openapi:lint: passed
```

## Runtime Evidence

Full auth e2e suites passed against real Postgres/Redis/MinIO (docker
`lamara-backend-*`), proving OIDC exchange/connect, password register/login/
change, refresh/logout, email verification, and account-deletion flows are
behavior-preserving after the moves.

## Environment Notes (pre-existing, not caused by this phase)

- The shell exports `NODE_ENV=production`, which makes `loadDotEnvOnce` skip
  `.env` and forces Prisma SSL + prod boot. OpenAPI generation and e2e/int runs
  must set `NODE_ENV=development` or `NODE_ENV=test` explicitly.
- 5 unit suites in `libs/platform/` (email, redis, storage, fcm-push,
  access-token-verifier) fail on the pre-change baseline too: shell env vars
  leak into `ConfigService` (which reads `process.env` via fallback when specs
  pass `{}` stubs). Out of scope for this phase.

## Risks And Mitigations

- Risk: OIDC account-linking/uniqueness breaks after the move.
  - Mitigation: no semantic edits; controller delegates through `AuthService`
    to the same `AuthOidcAuthService`; e2e covers exchange/connect.
- Risk: route paths or tags change.
  - Mitigation: keep route decorators equivalent; OpenAPI snapshot unchanged.
- Risk: deleting `AuthController` breaks wiring.
  - Mitigation: only `auth.module.ts` referenced it; updated to `OidcController`;
    typecheck + e2e pass.
- Risk: DTO moves change the API schema.
  - Mitigation: moved OIDC DTOs only; shared envelope DTOs stay; OpenAPI schema
    refs unchanged.

## Completion Notes

- Extracted OIDC into `libs/features/auth/oidc/`:
  - `oidc.controller.ts` (exchange/connect)
  - `oidc.dto.ts` (OIDC exchange/connect DTOs)
- Deleted `AuthController` (OIDC was its last handler).
- Removed OIDC DTOs from `auth.dto.ts`; kept shared result-envelope DTOs.
- Kept `AuthOidcAuthService` in `app/` (boundary constraint).
- OpenAPI snapshot unchanged.

## Follow-Ups

- [ ] Phase 7 shared cleanup: reassess whether `AuthService` should remain as a
      facade (it now delegates register/login/change-password + OIDC), whether
      the shared result-envelope DTOs should move, and whether
      `AuthSessionLifecycleService` can move once the `app/` -> capability
      boundary rules are reviewed.
