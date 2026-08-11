# Auth Email Verification Capability Split

Date: 2026-08-08  
Owner: Codex  
Status: completed  
Risk class: high  
Related issue/PR: N/A

## Objective

Perform Phase 1 of the auth capability split: move email verification service,
token helper, jobs, and HTTP handlers into `libs/features/auth/email-verification`
without changing public API behavior, job contracts, token semantics, rate
limits, or OpenAPI operation contracts.

## Constraints

- Architecture constraints:
  - keep `AuthModule` as the public module imported by `apps/api`;
  - keep existing `AuthError` and `AuthErrorFilter` behavior;
  - keep Prisma auth repository facade intact;
  - keep `RedisEmailVerificationRateLimiter` in current infra rate-limit path
    unless moving it is mechanically safe and import-only.
- Product/runtime constraints:
  - no endpoint path, status, response, error-code, or auth behavior change;
  - no Prisma schema or migration change;
  - no worker job payload/queue/name semantic change.
- Out of scope:
  - password reset split;
  - session/password/OIDC split;
  - shared repository cleanup;
  - commits or pushes.

## Impact Areas

- API/OpenAPI: yes, controller/DTO ownership changes must preserve contract
- DB/Prisma/migrations: no
- Auth/session/RBAC: yes, email verification auth flow organization only
- Queue/jobs: yes, email verification job imports/ownership
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: email worker import paths only
- CI/release/harness: yes

## Acceptance Criteria

1. `POST /v1/auth/email/verify` and
   `POST /v1/auth/email/verification/resend` are owned by an email verification
   controller.
2. Email verification service/token/job files live under
   `libs/features/auth/email-verification/`.
3. Existing endpoint paths, operation IDs, status codes, DTO schemas, and error
   codes are unchanged.
4. Worker email job imports compile with the new job paths.
5. Targeted auth/email tests and static checks pass.
6. OpenAPI generate/check/lint pass.

## Implementation Checklist

- [x] Map current email verification imports and handlers.
- [x] Move service/token/job files into capability folder.
- [x] Extract email verification DTOs and controller handlers.
- [x] Update `AuthModule` provider/controller imports.
- [x] Update worker imports and tests.
- [x] Run targeted verification.

## Decision Log

- 2026-08-08: Split email verification first -> narrower than sessions/password
  and validates service/controller/job movement with lower blast radius.
- 2026-08-08: Keep `RedisEmailVerificationRateLimiter` in place for this phase
  unless import-only movement remains trivial -> avoid expanding scope.

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
```

Additional e2e/int checks may be needed if static and focused tests do not cover
the moved route/job behavior sufficiently.

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
- Risk: auth behavior changes unintentionally.
  - Mitigation: avoid logic edits; prefer file moves and import updates.

## Completion Notes

- Extracted email verification into
  `libs/features/auth/email-verification/`.
- Added `EmailVerificationController` and moved the two email verification
  routes out of the main `AuthController`.
- Removed email verification pass-through methods from `AuthService`, avoiding
  an `app/` -> capability-folder dependency.
- Updated worker/test imports to use the new job/token paths.

## Follow-Ups

- [ ] Phase 2 password reset capability split.
