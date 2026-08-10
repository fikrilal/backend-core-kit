# Superseded Shared Simple Problem Primitive

Date: 2026-08-08  
Owner: Codex  
Status: superseded  
Risk class: medium  
Related issue/PR: N/A

## Objective

Historical record: this batch added a shared simple HTTP error primitive and
filter so generated feature slices could return RFC7807 problem details without
feature-specific error classes and filters by default.

Superseded on 2026-08-09: the primitive stayed unused outside scaffold/docs and
added another concept on top of `ProblemException` plus the global
`ProblemDetailsFilter`. Current guidance is to throw `ProblemException` for
simple HTTP failures and add feature-specific filters only when clients need
stable branchable feature codes or special mapping behavior.

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

Historical acceptance criteria:

1. Platform exposed a typed shared error class for app/feature HTTP failures.
2. Platform exposed a reusable exception filter that mapped the shared error to
   existing problem-details responses and supported `Retry-After`.
3. Unit tests covered status/code/detail/issues/retry-after behavior.
4. Simple and clean scaffold controllers used the shared filter instead of
   feature-specific generated filters.
5. Scaffold smoke still validated simple and clean generated features.

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

Historical commands run in the original batch:

```bash
npm run format:check
npm run lint
npm run typecheck
targeted simple problem primitive unit test
npm run scaffold:smoke
npm run deps:check
```

Outcomes:

- targeted simple problem primitive unit test: passed.
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

Implemented the historical shared simple problem primitive batch:

- added a typed shared platform error for simple feature HTTP failures;
- added a small filter that delegated to existing problem-details mapping and
  supported `Retry-After`;
- added focused unit tests for status/code/detail/issues/retry-after behavior;
- updated simple and clean scaffold controller templates to use the shared
  filter;
- documented when endpoint authors should use the shared primitive instead of
  feature-specific error classes/filters.

## Follow-Ups

- [ ] Add conservative endpoint decorator helpers only if repeated boilerplate
      remains after using the shared filter.
- [ ] Prove the new structure on one small non-auth slice.
