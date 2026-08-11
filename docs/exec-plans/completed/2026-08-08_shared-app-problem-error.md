# Shared App Problem Error Primitive

Date: 2026-08-08  
Owner: Codex  
Status: completed  
Risk class: medium  
Related issue/PR: N/A

## Objective

Add a shared HTTP/app error primitive and filter so simple feature slices can
return RFC7807 problem details without generating feature-specific error classes
and filters by default. Update scaffold templates to use the shared filter.

## Constraints

- Architecture constraints:
  - keep `libs/platform/*` reusable and independent from `libs/features/*`;
  - error primitive must use stable `AppErrorCode` values, not raw strings;
  - do not weaken existing feature-specific filters or mappings.
- Product/runtime constraints:
  - no public API contract changes for existing endpoints;
  - no auth/session/RBAC behavior changes;
  - no database, queue, or environment behavior changes.
- Out of scope:
  - migrating existing auth/users/admin errors to the new primitive;
  - generic endpoint decorator helpers;
  - auth capability split;
  - commits or pushes.

## Impact Areas

- API/OpenAPI: no existing contract changes; generated future scaffold only
- DB/Prisma/migrations: no
- Auth/session/RBAC: no behavior change
- Queue/jobs: scaffold-only imports for generated queue code remain supported
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: no
- CI/release/harness: yes

## Acceptance Criteria

1. Platform exposes a typed shared error class for app/feature HTTP failures.
2. Platform exposes a reusable exception filter that maps the shared error to
   existing problem-details responses and supports `Retry-After`.
3. Unit tests cover status/code/detail/issues/retry-after behavior.
4. Simple and clean scaffold controllers use the shared filter instead of
   feature-specific generated filters.
5. Scaffold smoke still validates simple and clean generated features.

## Implementation Checklist

- [x] Add shared error class.
- [x] Add shared error filter.
- [x] Add unit tests.
- [x] Update scaffold templates.
- [x] Run targeted verification.

## Decision Log

- 2026-08-08: Do not wire the new filter globally -> avoids changing existing
  endpoint behavior and lets scaffolded/simple slices opt in explicitly.
- 2026-08-08: Do not migrate existing feature errors in this batch -> keeps auth
  and existing feature behavior stable.

## Verification

Commands to run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test -- --runTestsByPath libs/platform/http/filters/app-problem-error.filter.spec.ts
npm run scaffold:smoke
npm run deps:check
```

Outcomes:

- `npm test -- --runTestsByPath libs/platform/http/filters/app-problem-error.filter.spec.ts`: passed.
- `npm run scaffold:smoke`: passed. Generated temporary simple and clean features with queues, ran lint/typecheck/deps, then cleaned generated files.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- `npm run deps:check`: passed.

## Runtime Evidence

Not required. This batch is covered by unit tests and scaffold/static checks; no
existing endpoint wiring changes.

## Risks And Mitigations

- Risk: shared filter produces a different problem-details shape.
  - Mitigation: delegate to existing `ProblemDetailsFilter` and test the output.
- Risk: scaffolded code compiles but violates boundaries.
  - Mitigation: scaffold smoke runs lint, typecheck, and deps checks.
- Risk: new primitive encourages generic errors for domain-specific client
  branches.
  - Mitigation: keep code typed as `AppErrorCode`; feature-specific codes still
    live in shared feature-code enums when clients need to branch.

## Completion Notes

Implemented the shared app problem primitive batch:

- added `AppProblemError` as a typed shared platform error for simple feature
  HTTP failures;
- added `AppProblemErrorFilter` that delegates to existing problem-details
  mapping and supports `Retry-After`;
- added focused unit tests for status/code/detail/issues/retry-after behavior;
- updated simple and clean scaffold controller templates to use the shared
  filter;
- documented when endpoint authors should use `AppProblemError` instead of
  feature-specific error classes/filters.

## Follow-Ups

- [ ] Add conservative endpoint decorator helpers only if repeated boilerplate
      remains after using the shared filter.
- [ ] Prove the new structure on one small non-auth slice.
