# Backend Core Kit Code Quality Review

Date: 2026-02-26
Reviewer: Staff/Principal Engineering Review
Scope: `apps/*`, `libs/*`, docs + architecture alignment for DRY, SOLID, KISS, YAGNI, scalability, readability, complexity.

## Executive Summary

The codebase has a strong foundation: strict TypeScript, clear architectural intent, solid OpenAPI/contract gates, and good platform modules (`http`, `queue`, `auth`, `rbac`, `storage`).

The main gap is not the standards themselves, but consistency in applying them. There are several high-value refactors that will materially improve scale-readiness and reduce feature onboarding time:

- Reduce repeated infra logic (cursor pagination adapters, retry loops, request metadata plumbing).
- Tighten architecture enforcement around app-layer dependencies and error code typing.
- Productize the “feature scaffolding experience” so adding a module/endpoint becomes mostly assembly, not handwritten boilerplate.

Overall maturity: strong baseline, medium-high maintainability risk in hotspots due duplication and large orchestration files.

## What Is Already Strong

- Strict TS posture and explicit no-`any` linting (`tsconfig.json`, `eslint.config.mjs`).
- Boundary checks via dependency-cruiser (`.dependency-cruiser.cjs`).
- Good platform abstractions for API envelope, problem details, idempotency, queue producer/worker, RBAC, request-id correlation.
- Solid contract discipline (OpenAPI snapshot generation/check + Spectral gates).
- Many services use `Clock` injection correctly, improving testability and determinism.

## Findings (Prioritized)

## 1) High: App Layer Depends on Platform Storage (Boundary Drift)

Principles: SOLID (DIP), scalability, architecture integrity.

Evidence:

- `libs/features/users/app/user-profile-image.service.ts:2`
- `libs/features/users/app/user-profile-image.service.ts:3`

Why this matters:

- App layer is coupled to a concrete platform abstraction (`ObjectStorageService`) instead of a feature-owned port.
- This makes feature logic harder to reuse and weakens the `infra -> app -> domain` contract.
- It also creates hidden gate risk if boundary tooling ignores type-only imports.

Recommendation:

- Add feature port in `libs/features/users/app/ports` (e.g. `ProfileImageStoragePort`) with only needed methods (`presignPutObject`, `presignGetObject`, `headObject`, `deleteObject`, `isEnabled`, `getBucketName`).
- Provide infra adapter wrapping `ObjectStorageService` in `users/infra`.
- Keep app layer importing only the port.

---

## 2) High: Cursor/Sort/After-Where Logic Is Reimplemented Repeatedly

Principles: DRY, KISS, defect prevention.

Evidence:

- `libs/features/admin/infra/persistence/prisma-admin-users.repository.ts:46`
- `libs/features/admin/infra/persistence/prisma-admin-users.repository.ts:92`
- `libs/features/admin/infra/persistence/prisma-admin-audit.repository.ts:62`
- `libs/features/admin/infra/persistence/prisma-admin-audit.repository.ts:138`
- `libs/features/auth/infra/persistence/prisma-auth.repository.sessions.ts:29`
- `libs/features/auth/infra/persistence/prisma-auth.repository.sessions.ts:67`

Why this matters:

- Same algorithm appears with small variations, increasing bug risk and review cost.
- Every new list endpoint will copy this pattern again.

Recommendation:

- Create shared helper in `libs/shared/list-query` (e.g. `buildAfterCursorWhere<TField, TWhere>()`) with field-mapper callbacks.
- Keep feature-specific filter mapping local, but standardize cursor comparison/equality composition and next-cursor generation.

---

## 3) High: Retryable Transaction Logic Is Duplicated Across Features + Worker

Principles: DRY, reliability, consistency.

Evidence:

- Canonical utility exists: `libs/features/auth/infra/persistence/prisma-auth.repository.tx.ts:3`
- Reimplemented in admin users repo: `libs/features/admin/infra/persistence/prisma-admin-users.repository.ts:488`
- Reimplemented in users repo: `libs/features/users/infra/persistence/prisma-users.repository.ts:290`
- Reimplemented in worker: `apps/worker/src/jobs/users-account-deletion.worker.ts:411`

Why this matters:

- Retry classification drift over time is likely (codes, error text matching, retries behavior).
- Different modules may behave inconsistently under the same transient DB failure mode.

Recommendation:

- Promote retry classifier + retry wrapper into `libs/platform/db/tx-retry.ts`.
- Reuse across repositories and worker transactions.
- Optionally add jitter/backoff strategy (bounded) in one place.

---

## 4) High: Error Code Hygiene Is Leaky in HTTP Layer

Principles: contract stability, correctness, governance.

Evidence:

- Raw string code constant in controller: `libs/features/auth/infra/http/me-push-token.controller.ts:25`
- Raw code used in response: `libs/features/auth/infra/http/me-push-token.controller.ts:60`
- `ApiErrorCodes` accepts generic string: `libs/platform/http/openapi/api-error-codes.decorator.ts:5`

Why this matters:

- Violates stated rule “no raw string code values.”
- Makes error-code drift easy and weakens compile-time contract safety.

Recommendation:

- Introduce `AUTH_PUSH_NOT_CONFIGURED` in shared auth feature enum (`libs/shared/auth/auth-error-codes.ts`).
- Replace raw constant usage with enum.
- Tighten `ApiErrorCodes` type to a known union (global + feature codes) via shared `AppErrorCode` type.

---

## 5) Medium: Time Source Usage Is Inconsistent (Clock vs Ad-hoc `new Date()`)

Principles: determinism, testability, KISS.

Evidence:

- Controller creates timestamp directly: `libs/features/admin/infra/http/admin-users.controller.ts:148`
- Auth jobs use ad-hoc time: `libs/features/auth/infra/jobs/auth-email-verification.jobs.ts:27`, `libs/features/auth/infra/jobs/auth-password-reset.jobs.ts:40`
- Push jobs use ad-hoc time: `libs/platform/push/push.jobs.ts:31`
- Other areas already use injected clock, e.g. `libs/features/users/infra/jobs/user-account-deletion-email.jobs.ts:37`

Why this matters:

- Mixed time strategies increase cognitive load and flaky testing patterns.
- Cross-cutting policies (time skew, freeze-time tests) are harder to apply consistently.

Recommendation:

- Standardize on injected `Clock` token for all business and queue payload timestamp generation.
- Remove controller-generated `now`; generate in app/service layer.

---

## 6) Medium: Feature Error Filters Repeat Similar Mapping Logic

Principles: DRY, KISS, maintainability.

Evidence:

- `libs/features/auth/infra/http/auth-error.filter.ts`
- `libs/features/users/infra/http/users-error.filter.ts`
- `libs/features/admin/infra/http/admin-error.filter.ts`

Why this matters:

- Same patterns (retry-after, title mapping, mapping to `ProblemException`) repeated.
- New feature means another bespoke filter and likely divergence.

Recommendation:

- Create reusable base mapper helper in platform HTTP (e.g. `mapFeatureErrorToProblem`) with feature-specific config.
- Keep feature-specific codes/messages but centralize title/status boilerplate.

---

## 7) Medium: Repeated “Best-effort Job Enqueue + Log” Pattern in Controllers

Principles: DRY, readability.

Evidence:

- `libs/features/auth/infra/http/auth.controller.ts:100`
- `libs/features/auth/infra/http/auth.controller.ts:269`
- `libs/features/users/infra/http/profile-image.controller.ts:94`
- `libs/features/users/infra/http/user-account-deletion.controller.ts:61`

Why this matters:

- Same try/catch logging pattern repeated in multiple controllers.
- Harder to standardize message format, observability tags, metrics.

Recommendation:

- Add shared helper (e.g. `runBestEffort(logger, context, fn)`) in platform/logging or feature utility.
- Optionally emit a standardized metric/event when best-effort side effects fail.

---

## 8) Medium: Request Metadata Plumbing Is Repeated in Controllers

Principles: KISS, DRY.

Evidence:

- Local UA normalizer in one controller: `libs/features/auth/infra/http/auth.controller.ts:44`
- Repeated `traceId: req.requestId ?? 'unknown'` across controllers:
  - `libs/features/admin/infra/http/admin-users.controller.ts:107`
  - `libs/features/users/infra/http/profile-image.controller.ts:91`
  - `libs/features/users/infra/http/user-account-deletion.controller.ts:56`

Why this matters:

- Boilerplate accumulates with every endpoint.
- Fallback to `'unknown'` can hide missing correlation wiring rather than failing loudly.

Recommendation:

- Add request context decorators:
  - `@RequestTraceId()`
  - `@ClientMetadata()` returning `{ ip, userAgent }`
- Enforce request-id presence from platform hook contract and drop `'unknown'` fallback where feasible.

---

## 9) Medium: Module Wiring Boilerplate Will Slow Feature Addition

Principles: scalability, developer productivity, YAGNI (avoid repetitive manual assembly).

Evidence:

- Repeated `useFactory` wrappers + `new SystemClock()` in feature modules:
  - `libs/features/auth/infra/auth.module.ts:49`
  - `libs/features/users/infra/users.module.ts:41`
  - `libs/features/admin/infra/admin.module.ts:19`

Why this matters:

- Every feature setup repeats DI assembly logic manually.
- More wiring code means more review noise and setup mistakes.

Recommendation:

- Introduce a small “feature provider builder” utility (infra-level) for pure app services.
- Add scaffolding script for new feature/endpoint/job under `tools/` (generate module, ports, controller skeleton, DTO/envelope, error filter registration).

---

## 10) Medium: Large Orchestration Files Increase Change Risk

Principles: SRP, readability, complexity management.

Evidence:

- `libs/features/auth/app/auth.service.ts` (~652 LOC)
- `libs/platform/http/idempotency/idempotency.service.ts` (~427 LOC)
- `apps/worker/src/jobs/users-account-deletion.worker.ts` (~414 LOC)

Why this matters:

- Harder to reason about invariants and edge cases quickly.
- Refactors become high-risk because concerns are interleaved.

Recommendation:

- Split by use-case flows and pure helpers:
  - `auth.service`: password auth, OIDC auth, session lifecycle, token lifecycle.
  - idempotency: request hashing, record parsing, redis orchestration, replay policy.
  - users worker: finalize pipeline vs profile-image cleanup pipeline.

---

## 11) Low-Medium: Monolithic E2E Test File Reduces Maintenance Speed

Principles: readability, scalability.

Evidence:

- `test/auth.e2e-spec.ts` (~2070 LOC)

Why this matters:

- Large test files make failure triage slow and increase merge conflict frequency.

Recommendation:

- Split by behavior areas (`auth-password.e2e-spec.ts`, `auth-oidc.e2e-spec.ts`, `auth-refresh.e2e-spec.ts`, etc.) and use shared fixtures/builders.

## Improvement Roadmap (Pragmatic)

## Phase 1 (1-2 weeks) — High ROI / Low Risk

1. Fix error code hygiene:

- Add typed `AUTH_PUSH_NOT_CONFIGURED` enum value.
- Tighten `ApiErrorCodes` typing.

2. Centralize retry logic:

- Create `platform/db/tx-retry.ts`.
- Replace duplicated retry classifiers/loops in admin/users/worker.

3. Standardize request metadata helpers:

- Add decorators for `traceId` and client metadata.
- Remove repeated `'unknown'` fallback usage.

## Phase 2 (2-4 weeks) — Structural DRY

1. Extract shared cursor-after builder for Prisma list endpoints.
2. Introduce reusable feature error mapping helper.
3. Refactor repeated best-effort job enqueue pattern into common helper.

## Phase 3 (4-8 weeks) — Scale Feature Delivery

1. Add feature scaffolder under `tools/` for module/app/infra/controller/test skeleton.
2. Add provider-builder utility for pure app services (to reduce module boilerplate).
3. Split high-complexity files into focused components while preserving behavior.

## Target “Easy-to-Add-Endpoint” Blueprint

To meet the goal of “new module/endpoint is extremely easy because core handles most code,” build a thin internal framework on top of current platform:

1. Endpoint composition kit:

- `@Authenticated()` (guard + bearer)
- `@AdminRoute(...)` (auth + rbac + db role hydration + tags)
- `@CommandEndpoint(...)` (idempotency + default error codes + OpenAPI hints)

2. Request context kit:

- `@RequestTraceId()`
- `@ClientContext()`

3. Error kit:

- typed shared `AppErrorCode`
- feature error mapper helper

4. List query kit:

- shared cursor/where builder adapters for Prisma

5. Scaffolder:

- one command to create feature slice skeleton with defaults wired.

## Risks If Unaddressed

- Feature velocity degrades as duplication compounds.
- Subtle divergence in retries/pagination/error contracts across modules.
- More onboarding friction for new contributors.
- Higher regression probability during auth/admin/queue changes.

## Validation Notes

- Static architecture and source inspection completed.
- Runtime checks (`npm run verify`) were not executed in this review session because `node_modules` is not present in the current workspace.
