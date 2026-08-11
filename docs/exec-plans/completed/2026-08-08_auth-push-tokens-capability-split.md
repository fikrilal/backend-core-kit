# Auth Push Tokens Capability Split

Date: 2026-08-08  
Owner: Codex  
Status: completed  
Risk class: high  
Related issue/PR: N/A

## Objective

Perform Phase 3 of the auth capability split: move the current-session push
token service, controller, DTO, and controller spec into
`libs/features/auth/push-tokens` without changing public API behavior, endpoint
paths, operation IDs, DTO schemas, error codes, or push semantics.

## Constraints

- Keep `AuthModule` as the public module imported by `apps/api`.
- Keep existing `AuthError` and `AuthErrorFilter` behavior.
- Keep Prisma auth repository facade intact.
- Keep the `PUSH_SERVICE` platform token injection unchanged.
- Do not change endpoint paths, operation IDs, response status codes,
  error-code metadata, or request schemas.
- Do not change Prisma schema or migrations.
- Do not change push provider behavior or job semantics.
- Do not commit or push.

## Acceptance Criteria

1. `PUT /v1/me/push-token` and `DELETE /v1/me/push-token` are owned by a push
   token controller.
2. Push token service, controller, DTO, and spec live under
   `libs/features/auth/push-tokens/`.
3. Existing endpoint paths, operation IDs, status codes, DTO schemas, and error
   codes are unchanged.
4. The controller-local spec moves with the capability and passes.
5. `AuthModule` provider/controller wiring remains explicit and readable.
6. Targeted auth/controller tests and static checks pass.
7. OpenAPI generate/check/lint pass.

## Implementation Checklist

- [x] Map current push token imports and handlers.
- [x] Move service, controller, DTO, and spec into capability folder.
- [x] Update `AuthModule` provider/controller imports.
- [x] Remove old `app/` and `infra/http/` files.
- [x] Run targeted verification.

## Decision Log

- 2026-08-08: Match Phases 1-2 boundary handling: controller depends directly on
  the capability service; no `AuthService` pass-through existed for push tokens.
- 2026-08-08: Move the controller-local spec with the capability, per the
  roadmap's Phase 3 proving-point note.

## Verification

Commands to run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run deps:check
npm test -- --runTestsByPath libs/features/auth/push-tokens/push-token.controller.spec.ts
npm test -- --runTestsByPath libs/features/auth libs/features/admin apps/worker/src/jobs/emails.worker.spec.ts
npm run openapi:generate
npm run openapi:check
npm run openapi:lint
```

Completed:

```bash
npm run typecheck: passed
npm run deps:check: passed (no dependency violations, 308 modules cruised)
npm test -- --runTestsByPath libs/features/auth/push-tokens/push-token.controller.spec.ts: passed (2 tests)
npm test -- --runTestsByPath libs/features/auth libs/features/admin apps/worker/src/jobs/emails.worker.spec.ts: passed
npm run format:check: passed
npm run lint: passed
npm run openapi:generate: passed (no snapshot change)
npm run openapi:check: passed
npm run openapi:lint: passed (no warn or higher findings)
```

Note: `npm run openapi:generate` must be run with `NODE_ENV=development` (or
without a production-like `NODE_ENV` in the shell). A production `NODE_ENV` in
the shell makes `loadDotEnvOnce` skip `.env`, so the app boots in
staging/production mode, Prisma connects with SSL, and the local Postgres
rejects it.

## Runtime Evidence

No runtime-only evidence was collected. Static checks, dependency boundary
checks, the moved controller spec, and OpenAPI checks passed. OpenAPI snapshot
did not change: the two push-token endpoints kept their paths, operation IDs,
schemas, statuses, and error-code metadata, and the controller registration
order in `AuthModule` is unchanged.

## Risks And Mitigations

- Risk: endpoint metadata changes.
  - Mitigation: preserve decorators and run OpenAPI generate/check/lint.
- Risk: `PUSH_SERVICE` token injection breaks after the move.
  - Mitigation: keep the platform token import and run the moved controller
    spec, which exercises both enabled and disabled push paths.
- Risk: controller split changes route paths due to controller prefixing.
  - Mitigation: keep route decorators equivalent and inspect generated OpenAPI.
- Risk: unrelated local test failures mask regressions.
  - Mitigation: confirmed the 5 failing platform suites (email/redis/storage/
    fcm/access-token-verifier) fail on the pre-change baseline too; they are
    caused by shell env vars leaking into `ConfigService` and are out of scope
    for this phase.

## Completion Notes

- Extracted push tokens into `libs/features/auth/push-tokens/`.
- Added `MePushTokenController` (renamed to `push-token.controller.ts`) with the
  two push-token routes.
- Moved `AuthPushTokensService` (renamed to `push-tokens.service.ts`), DTO
  (`push-token.dto.ts`), and the controller spec
  (`push-token.controller.spec.ts`).
- Updated `AuthModule` imports and removed the old `app/` and `infra/http/`
  files.
- Kept `AuthErrorFilter` and `AuthError` usage as-is; no `AuthService`
  dependency existed for push tokens.

## Follow-Ups

- [ ] Phase 4 sessions and JWKS capability split.
