# Auth Shared Cleanup (Phase 7)

Date: 2026-08-08  
Owner: Codex  
Status: completed  
Risk class: high  
Related issue/PR: N/A

## Objective

Finish the auth capability split: consolidate the remaining shared auth code
under `libs/features/auth/shared`, move the last app services into their
capability folders, delete the `AuthService` facade, remove the `app/`,
`infra/`, and `domain/` trees, and move the module to the feature root — leaving
no stale code behind.

## Constraints

- Keep `AuthModule` as the public module imported by `apps/api`.
- Preserve all endpoint paths, operation IDs, tags, schemas, and error codes.
- Preserve auth/session/RBAC behavior (timing-safe login, refresh rotation,
  reuse detection, OIDC linking).
- Preserve dependency-cruiser boundaries: platform must not depend on features,
  shared must be framework-free, no cycles.
- Do not change Prisma schema or migrations.
- Do not commit or push.

## Acceptance Criteria

1. `libs/features/auth/shared/` holds the shared framework-free layer (config,
   error codes, errors, types, helpers, user-state, time, email, ports) plus
   shared Nest adapters (error filter, shared DTOs, persistence facade + split
   files, security adapters, rate limiters, tokens).
2. Capability services live in their capability folders: `password/`,
   `oidc/`, `sessions/`.
3. `AuthService` is deleted; controllers inject capability services directly.
4. `app/`, `infra/`, and `domain/` directories are removed.
5. `auth.module.ts` lives at the feature root.
6. No stale references to old paths remain.
7. Unit specs are relocated per capability (deleted-user semantics preserved).
8. OpenAPI snapshot is unchanged.
9. typecheck, lint, format, deps, unit, e2e, and int suites pass.

## Implementation Checklist

- [x] Map all remaining auth app/infra files.
- [x] Move shared code into `auth/shared/`.
- [x] Move app services into capabilities.
- [x] Delete `AuthService` and rewire controllers.
- [x] Move module to feature root; delete `app/`/`infra/`/`domain/`.
- [x] Relocate and rework specs (deleted-user, oidc, helpers).
- [x] Run full verification.

## Decision Log

- 2026-08-08: `AuthService` deleted — it was a pure pass-through facade after
  Phases 1-6; controllers now inject `AuthPasswordAuthService` /
  `AuthOidcAuthService` directly.
- 2026-08-08: `AuthSessionLifecycleService` moved to `sessions/` (with
  `refresh-token.ts`) now that the `app/` folder is gone — the
  `feature-app-must-not-import-infra-or-framework` rule no longer applies.
- 2026-08-08: Shared Nest adapters (error filter, DTOs, persistence, security,
  rate-limit, tokens) live in `auth/shared/` — this is a feature-internal
  shared folder, not `libs/shared`, so importing platform adapters is allowed.
- 2026-08-08: Deleted `auth.service.deleted-user.spec.ts` and
  `auth.service.oidc.spec.ts`; split them into per-capability specs
  (`password/password-auth.service.deleted-user.spec.ts`,
  `oidc/oidc-auth.service.deleted-user.spec.ts`,
  `sessions/session-lifecycle.service.deleted-user.spec.ts`,
  `oidc/oidc-auth.service.spec.ts`) so security-critical semantics stay tested.

## Verification

Commands to run:

```bash
npm run typecheck
npm run deps:check
npm run format:check
npm run lint
npm test (unit)
NODE_ENV=test npx jest --config test/jest-e2e.json --runInBand --runTestsByPath test/auth
NODE_ENV=development npx jest --config test/jest-int.json --runInBand --runTestsByPath test/rate-limiters.int-spec.ts test/auth-emails-worker.int-spec.ts
NODE_ENV=development npm run openapi:generate
NODE_ENV=development npm run openapi:check
npm run openapi:lint
```

Completed:

```bash
npm run typecheck: passed
npm run deps:check: passed (no dependency violations, 311 modules, 761 deps)
npm run format:check: passed
npm run lint: passed
npm test: 49 suites passed, 5 pre-existing platform failures (env issue)
test/auth e2e (53 tests): passed
test/rate-limiters + auth-emails-worker int (8 tests): passed
npm run openapi:generate: passed (snapshot unchanged)
npm run openapi:check: passed
npm run openapi:lint: passed
```

## Runtime Evidence

Full auth e2e + int suites passed against real Postgres/Redis/MinIO (docker
`lamara-backend-*`), proving register, login, OIDC exchange/connect, refresh
rotation, reuse detection, logout, session revoke, JWKS, email verification,
password reset, and account-deletion flows are behavior-preserving after the
full restructure.

## Environment Notes (pre-existing, not caused by this phase)

- The shell exports `NODE_ENV=production`, which makes `loadDotEnvOnce` skip
  `.env` and forces Prisma SSL + prod boot. OpenAPI generation and e2e/int runs
  must set `NODE_ENV=development` or `NODE_ENV=test` explicitly.
- 5 unit suites in `libs/platform/` (email, redis, storage, fcm-push,
  access-token-verifier) fail on the pre-change baseline too: shell env vars
  leak into `ConfigService` (which reads `process.env` via fallback when specs
  pass `{}` stubs). Out of scope for this phase.

## Risks And Mitigations

- Risk: deleting `AuthService` breaks controllers.
  - Mitigation: controllers inject capability services directly; typecheck +
    e2e pass.
- Risk: relocating specs loses security-critical coverage.
  - Mitigation: split deleted-user/oidc specs per capability; all pass.
- Risk: `app/` removal changes dependency-cruiser semantics.
  - Mitigation: deps:check passes (311 modules, 761 deps, no violations).
- Risk: OpenAPI contract changes.
  - Mitigation: snapshot unchanged; check/lint pass.

## Completion Notes

- Final auth structure is capability-oriented with a `shared/` layer; no
  `app/`/`infra/`/`domain/` trees remain.
- `AuthService` facade deleted; `auth.module.ts` at feature root.
- All security-critical specs relocated and passing.

## Follow-Ups

- Auth capability split is complete. Remaining known issue: the 5 pre-existing
  platform unit failures caused by shell env leaking into `ConfigService`
  (tracked separately).
