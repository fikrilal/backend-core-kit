# Enterprise Code Quality Remediation TODO

Date: 2026-02-26  
Source review: `_WIP/2026-02-26_enterprise-code-quality-review.md`

## Tracking Rules

- Status legend: `[ ]` todo, `[-]` in progress, `[x]` done
- Keep PRs small and reversible (one concern per PR where possible)
- Each task must include code changes + tests/docs updates when applicable

## Phase 1 (High ROI / Low Risk)

Goal: remove high-severity drift and establish shared primitives.

### P1-1 Architecture boundary fix (Finding #1)

- [x] Introduce `ProfileImageStoragePort` in `libs/features/users/app/ports`
- [x] Refactor `user-profile-image.service.ts` to depend on port only
- [x] Add infra adapter in users feature wrapping `ObjectStorageService`
- [x] Update users module DI wiring
- [x] Add/update unit tests for app service + adapter
- [x] Confirm no app->platform imports remain for this path

### P1-2 Transaction retry standardization (Finding #3)

- [x] Create shared utility in `libs/platform/db/tx-retry.ts`
- [x] Move classifier + retry wrapper into shared utility
- [x] Refactor usages in:
  - [x] `libs/features/admin/infra/persistence/prisma-admin-users.repository.ts`
  - [x] `libs/features/users/infra/persistence/prisma-users.repository.ts`
  - [x] `apps/worker/src/jobs/users-account-deletion.worker.ts`
  - [x] `libs/features/auth/infra/persistence/prisma-auth.repository.tx.ts` (align to shared)
- [x] Add tests for retry classification + retry behavior

### P1-3 Error code hygiene hardening (Finding #4)

- [x] Add typed `AUTH_PUSH_NOT_CONFIGURED` in shared auth error code enum
- [x] Remove raw string code usage in `me-push-token.controller.ts`
- [x] Tighten `ApiErrorCodes` decorator typing to accepted app error code union
- [x] Ensure OpenAPI remains aligned with typed codes
- [x] Add/adjust tests for error mapping and response shape

### P1-4 Request metadata standardization (Finding #8)

- [x] Add request context decorators (`@RequestTraceId()`, `@ClientContext()` or equivalent)
- [x] Replace repeated `req.requestId ?? 'unknown'` in controllers
- [x] Replace ad-hoc client metadata extraction boilerplate
- [x] Validate correlation behavior still matches platform hooks

### P1 Exit Criteria

- [x] `npm run smells:arch:ci` reports no **new high** findings
- [x] `npm run openapi:check` passes after API changes
- [x] `npm run openapi:lint` passes
- [x] Regression tests for touched modules pass

---

## Phase 2 (Structural DRY)

Goal: reduce repeated infrastructure patterns and lower change cost for new endpoints.

### P2-1 Shared cursor-after builder (Finding #2)

- [x] Design reusable cursor comparator/where builder API under `libs/shared/list-query`
- [x] Refactor:
  - [x] `prisma-admin-users.repository.ts`
  - [x] `prisma-admin-audit.repository.ts`
  - [x] `prisma-auth.repository.sessions.ts`
- [x] Add cross-feature tests for cursor stability and ordering

### P2-2 Shared feature-error mapper (Finding #6)

- [x] Create base helper in `libs/platform/http` for mapping feature errors -> Problem Details
- [x] Refactor feature filters:
  - [x] `auth-error.filter.ts`
  - [x] `users-error.filter.ts`
  - [x] `admin-error.filter.ts`
- [x] Keep feature-specific codes/messages while removing repeated boilerplate

### P2-3 Best-effort side-effect helper (Finding #7)

- [x] Add `runBestEffort(...)` helper (logging + optional metric hook)
- [x] Refactor controller try/catch blocks using helper
- [x] Standardize logging fields and message shape
- [x] Add tests for failure path observability behavior

### P2 Exit Criteria

- [ ] Duplicate helper findings trend reduced in smell scan
- [ ] No behavior regressions in queue side-effect flows
- [ ] Controller code paths become thinner and easier to review

---

## Phase 3 (Scale Delivery)

Goal: make “new module/endpoint” mostly assembly using shared core patterns.

### P3-1 Module/provider wiring simplification (Finding #9)

- [ ] Introduce provider-builder utility for pure app services
- [ ] Remove repetitive `useFactory + new SystemClock()` wiring in feature modules
- [ ] Document standard module assembly pattern

### P3-2 Feature scaffolder (Findings #9 + blueprint)

- [ ] Create scaffold command under `tools/` for new feature slice
- [ ] Generate defaults for:
  - [ ] module + tokens + app service + ports
  - [ ] controller + DTO + error filter
  - [ ] optional queue job skeleton
  - [ ] baseline test skeletons
- [ ] Document usage in `docs/guide/adding-a-feature.md`

### P3-3 High-complexity file decomposition (Finding #10)

- [ ] Split `libs/features/auth/app/auth.service.ts`
- [ ] Split `libs/platform/http/idempotency/idempotency.service.ts`
- [ ] Split `apps/worker/src/jobs/users-account-deletion.worker.ts`
- [ ] Preserve external behavior and contracts
- [ ] Add focused tests around extracted units

### P3-4 E2E test modularization (Finding #11)

- [ ] Split `test/auth.e2e-spec.ts` by capability areas
- [ ] Extract shared fixtures/builders
- [ ] Reduce merge-conflict hotspots

### P3 Exit Criteria

- [ ] New feature/endpoint implementation time reduced (measured internally)
- [ ] Large-file hotspots reduced below target LOC thresholds
- [ ] E2E suite structure aligns with feature boundaries

---

## Cross-Phase Governance

### CI / Quality Gates

- [ ] Keep `smells:arch:ci` running in CI (fail on `high`)
- [ ] Re-baseline only after explicit review
- [ ] Track smell trend by phase in PR summary

### PR Template Additions

- [ ] Add section: `Phase Task IDs Covered` (e.g., `P1-2`, `P2-1`)
- [ ] Add section: `Architecture Smell Impact` (new/reduced/unchanged)
- [ ] Add section: `OpenAPI / Error Code Impact`

### Suggested PR Sequence

1. PR-1: P1-1 boundary port/adapters
2. PR-2: P1-2 tx-retry shared utility + migrations of usages
3. PR-3: P1-3 error-code typing + decorator hardening
4. PR-4: P1-4 request metadata decorators + controller cleanup
5. PR-5+: Phase 2 and 3 tasks one by one

## Notes

- Do not mix broad refactors with behavior changes in one PR.
- If a phase introduces policy changes, add/update ADR before merging.
