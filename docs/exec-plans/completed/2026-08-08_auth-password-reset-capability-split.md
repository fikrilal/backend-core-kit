# Auth Password Reset Capability Split

Date: 2026-08-08  
Owner: Codex  
Status: completed  
Risk class: high  
Related issue/PR: N/A

## Objective

Perform Phase 2 of the auth capability split: move password reset service,
token helper, jobs, DTOs, and HTTP handlers into
`libs/features/auth/password-reset` without changing public API behavior, job
contracts, token semantics, rate limits, or OpenAPI operation contracts.

## Constraints

- Keep `AuthModule` as the public module imported by `apps/api`.
- Keep existing `AuthError` and `AuthErrorFilter` behavior.
- Keep Prisma auth repository facade intact.
- Keep `RedisPasswordResetRateLimiter` in current infra rate-limit path for
  this phase.
- Do not change endpoint paths, operation IDs, response status codes,
  error-code metadata, or request schemas.
- Do not change Prisma schema or migrations.
- Do not change queue name, job name, or job payload shape.
- Do not commit or push.

## Acceptance Criteria

1. `POST /v1/auth/password/reset/request` and
   `POST /v1/auth/password/reset/confirm` are owned by a password reset
   controller.
2. Password reset service/token/job files live under
   `libs/features/auth/password-reset/`.
3. Existing endpoint paths, operation IDs, status codes, DTO schemas, and error
   codes are unchanged.
4. Worker email job imports compile with the new password reset job/token paths.
5. `AuthService` does not import or delegate to the password reset capability.
6. Targeted auth/email tests and static checks pass.
7. OpenAPI generate/check/lint pass.

## Implementation Checklist

- [x] Map current password reset imports and handlers.
- [x] Move service/token/job files into capability folder.
- [x] Extract password reset DTOs and controller handlers.
- [x] Remove password reset pass-through methods from `AuthService`.
- [x] Update `AuthModule` provider/controller imports.
- [x] Update worker imports and tests.
- [x] Run targeted verification.

## Decision Log

- 2026-08-08: Match Phase 1 boundary handling: controller depends directly on
  the capability service; `AuthService` stops acting as a pass-through facade.
- 2026-08-08: Keep the Redis rate limiter in infra for now to avoid expanding
  this phase into rate-limit shared cleanup.

## Verification

Commands to run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run deps:check
npm test -- --runTestsByPath libs/features/auth/app/auth.service.helpers.spec.ts libs/features/auth/app/auth.service.oidc.spec.ts libs/features/auth/app/auth.service.deleted-user.spec.ts
npm test -- --runTestsByPath apps/worker/src/jobs/emails.worker.spec.ts
npm run openapi:generate
npm run openapi:check
npm run openapi:lint
npm run verify:project-map
```

Completed:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run deps:check
npm test -- --runTestsByPath libs/features/auth/app/auth.service.helpers.spec.ts libs/features/auth/app/auth.service.oidc.spec.ts libs/features/auth/app/auth.service.deleted-user.spec.ts
npm test -- --runTestsByPath apps/worker/src/jobs/emails.worker.spec.ts
npm run openapi:generate
npm run openapi:check
npm run openapi:lint
```

Outcome: all completed commands passed.

## Runtime Evidence

No runtime-only evidence was collected. Static checks, focused tests, dependency
boundary checks, and OpenAPI checks passed. OpenAPI snapshot changed only because
the moved endpoints now appear under the extracted controller registration
order; endpoint paths, operation IDs, schemas, statuses, and error-code metadata
were preserved.

## Risks And Mitigations

- Risk: OpenAPI route metadata changes.
  - Mitigation: preserve decorators and run OpenAPI generate/check/lint.
- Risk: worker job imports break or payload names drift.
  - Mitigation: move job constants without semantic edits and run worker tests.
- Risk: controller split changes route paths due to controller prefixing.
  - Mitigation: keep route decorators equivalent and inspect generated OpenAPI.
- Risk: `AuthService` constructor updates break unit tests.
  - Mitigation: update focused tests and run targeted auth specs.

## Completion Notes

- Extracted password reset into `libs/features/auth/password-reset/`.
- Added `PasswordResetController` and moved the two password reset routes out of
  the main `AuthController`.
- Removed password reset pass-through methods from `AuthService`, avoiding an
  `app/` -> capability-folder dependency.
- Updated worker/test imports to use the new job/token paths.

## Follow-Ups

- [ ] Phase 3 push token capability split.
