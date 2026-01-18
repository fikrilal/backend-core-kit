# Users infra audit

Date: 2026-01-18

## Scope

Included:

- `libs/features/users/infra/**`
  - `http/**` (controllers, DTOs, filters)
  - `persistence/**` (Prisma repositories)
  - `jobs/**` (queue producers + job name/types)
  - `rate-limit/**`
  - `users.module.ts`

Reviewed for context (out of scope):

- `apps/worker/src/jobs/users-account-deletion.worker.ts` (users queue consumer)
- `apps/worker/src/jobs/auth-email-verification.worker.ts` (emails queue consumer, includes users deletion emails)
- Platform auth: `libs/platform/auth/access-token-verifier.service.ts` (stateless access token verification)

Excluded:

- `libs/features/users/app/**` (already audited in the previous sprint)

Method:

- Static review + targeted searches (`rg`).
- No new runtime checks were executed as part of this audit.

Docs / guides used for alignment:

- `docs/core/project-architecture.md`
- `docs/engineering/users/profile-images.md`
- `docs/engineering/users/account-deletion.md`
- `docs/standards/api-response-standard.md`
- `docs/standards/error-codes.md`

## Snapshot

The Users infra layer is **small** (≈1.8k LOC total) and generally **easy to read**:

- Controllers are thin and lean on app services.
- Error mapping is centralized via `UsersErrorFilter`.
- Profile image endpoints match the documented flow (direct-to-object-storage + server-side finalize).
- Account deletion flows match the documented 30-day grace model and last-admin invariant.

The main risks/opportunities are:

1. **Data integrity / compliance edge-cases** around **deleted-user invariants** (stateless access tokens + persistence TOCTOU).
2. **Maintainability**: repeated config parsing helpers and repeated Prisma `select` blocks.
3. **Ergonomics**: minor API polish (`429` title / `Retry-After`, more precise controller return types).

## What’s working well

- **Layering is clean**: infra depends on `app` ports/services and platform adapters; no obvious boundary violations.
- **Contract discipline is strong**:
  - Success envelope `{ data }` is used consistently (or `204` when appropriate).
  - `@ApiErrorCodes` are explicit per endpoint.
  - No raw string error codes: feature codes use `UsersErrorCode`, global codes use `ErrorCode`.
- **Observability baseline is respected**: controllers propagate `traceId` (requestId) into app/persistence for auditability.
- **Queue idempotency patterns are good**:
  - Jobs use stable `jobId` patterns and remove existing jobs before enqueueing (`user-account-deletion.jobs.ts`, `user-account-deletion-email.jobs.ts`, `profile-image-cleanup.jobs.ts`).
- **Profile image security posture is solid**:
  - Upload policy is enforced at DTO level (content-type + size).
  - Finalize step verifies object metadata before attaching (per docs).
  - Rate limiting is implemented and does not store raw IPs (hashed via SHA-256).

## Findings (prioritized)

### P0 — Data integrity: deleted-user invariants can be violated via TOCTOU writes

Evidence:

- Access tokens are **stateless** and do not verify session existence or user status:
  - `libs/platform/auth/access-token-verifier.service.ts:143`
- `PrismaUsersRepository.updateProfile(...)` previously used a read-then-write pattern (TOCTOU) and could reintroduce PII after deletion finalization.
- Account deletion finalization scrubs profile name fields (PII) after flipping status to `DELETED`:
  - `apps/worker/src/jobs/users-account-deletion.worker.ts:205`

Why this matters:

- Because access tokens remain valid until `exp` and there is no session check, a user can still hit `/me` endpoints shortly after deletion finalization.
- With the current **read-then-write** pattern, there is a race window where:
  - finalization commits (`status=DELETED`, profile scrubbed),
  - then `updateProfile(...)` upserts profile fields again,
  - re-introducing PII on a deleted account (scrubbing contract violation).

Recommendation (choose a path; smallest-first):

1. **Make deleted-user protection a DB-level write invariant** in the repository, not only an app-level guard:
   - Wrap profile updates in a transaction with a strict isolation + retry (similar to account deletion flows), so deletion finalization conflicts cause retry/abort.
   - Avoid “check then write” without transaction when the check is a security/compliance invariant.
2. **Reduce reliance on “profile may not exist”**:
   - Consider creating `UserProfile` at user creation (so profile updates can be a single `updateMany` with a relational filter).
3. **Longer-term (cross-cutting)**:
   - If immediate revocation is required, move towards stateful access token acceptance (e.g., verify session existence / user status on each request).

Implemented (2026-01-18):

- `PrismaUsersRepository.updateProfile(...)` now uses a transaction and gates writes via `user.updateMany(where: { status: { not: DELETED } })` before upserting profile data:
  - `libs/features/users/infra/persistence/prisma-users.repository.ts:112`
- Added a unit test to lock in the deleted-user write guard:
  - `libs/features/users/infra/persistence/prisma-users.repository.spec.ts:1`

### P1 — Maintainability: duplicated config parsing helpers + implicit config validation

Evidence (pre-fix):

- `asPositiveInt(...)` was duplicated in multiple Users infra components.
- Users-specific env vars are not part of the central env schema (so invalid overrides silently fall back).

Why this matters:

- Repeated helpers drift over time (slightly different “positive int” interpretations, defaults, etc.).
- Silent fallback on invalid env values can hide misconfiguration in production.

Recommendation:

- Centralize numeric parsing helpers under `libs/platform/config/**` (or a small `libs/shared/config/**`) and reuse.
- Add optional env validation for Users feature knobs (even if optional, validate type/range when provided).

Implemented (2026-01-18):

- Added Users profile image tuning env vars to central validation (invalid overrides now fail fast):
  - `libs/platform/config/env.validation.ts`
  - `libs/platform/config/env.validation.spec.ts`
- Refactored Users infra to consume validated numeric config directly (no local parsing helpers):
  - `libs/features/users/infra/rate-limit/redis-profile-image-upload-rate-limiter.ts`
  - `libs/features/users/infra/jobs/profile-image-cleanup.jobs.ts`

### P1 — Testability/consistency: infra uses ad-hoc time + duplicated `SystemClock` wiring

Evidence:

- Module wiring creates `SystemClock` inline twice:
  - `libs/features/users/infra/users.module.ts:42`
- Jobs use `new Date()` directly:
  - `libs/features/users/infra/jobs/profile-image-cleanup.jobs.ts:47`
  - `libs/features/users/infra/jobs/user-account-deletion-email.jobs.ts:34`
  - `libs/features/users/infra/jobs/user-account-deletion.jobs.ts:16`

Why this matters:

- Makes it harder to unit test job scheduling logic deterministically (especially delays and timestamp fields).
- Duplicated clock construction makes “override the clock” harder (handy for tests and time-travel simulations).

Recommendation:

- Provide a single clock provider in `UsersModule` (injectable token) and pass it into app services / jobs that need time.
- Prefer `clock.now()` for generating timestamps and delays, even in infra, when time is business-relevant.

### P1 — Maintainability: repeated Prisma `select` blocks in `PrismaUsersRepository`

Evidence:

- The same `select` shape is repeated in multiple methods:
  - `libs/features/users/infra/persistence/prisma-users.repository.ts:188`
  - `libs/features/users/infra/persistence/prisma-users.repository.ts:294`

Why this matters:

- Every time the “user view” changes (new field, auth method support, etc.), you have to update multiple blocks.
- It increases the chance of subtle drift (method A selects field X, method B forgets).

Recommendation:

- Introduce a shared `const USER_WITH_PROFILE_SELECT = { ... }` and reuse it.
- If the select grows, consider extracting to a small helper module next to the repository.

### P2 — API ergonomics: `429` title + optional `Retry-After`

Evidence:

- Rate limiting throws a `UsersError` with `status=429`:
  - `libs/features/users/infra/rate-limit/redis-profile-image-upload-rate-limiter.ts:104`
- `UsersErrorFilter.titleForStatus` doesn’t special-case `429`, so title becomes generic:
  - `libs/features/users/infra/http/users-error.filter.ts:35`

Recommendation:

- Add `429 → "Too Many Requests"` in `UsersErrorFilter`.
- Optional: include a `Retry-After` header (or a typed extension field) when `RATE_LIMITED` is returned.

### P2 — Type precision: controller returns `Promise<unknown>`

Evidence:

- `ProfileImageController.getProfileImageUrl(...)` returns `Promise<unknown>`:
  - `libs/features/users/infra/http/profile-image.controller.ts:201`

Why this matters:

- Makes controller contract harder to read and weakens IDE help / refactors.

Recommendation:

- Return a precise union (e.g. `Promise<ProfileImageUrlEnvelopeDto | undefined>`) and keep 204 behavior via `reply.status(204)`.

### P2 — Code organization: users deletion email jobs are processed in `AuthEmailsWorker`

Evidence (context):

- Users deletion emails are handled by `AuthEmailsWorker`:
  - `apps/worker/src/jobs/auth-email-verification.worker.ts:26`
  - `apps/worker/src/jobs/auth-email-verification.worker.ts:126`

Why this matters:

- It’s not wrong, but it’s a “surprise coupling” that increases cognitive load (“why is users email here?”).

Recommendation:

- Rename the worker to something like `EmailsWorker`, or split per feature once it grows.

## Suggested next backlog (smallest-first)

1. Add `429` title mapping (and optionally `Retry-After`) for `RATE_LIMITED`.
2. Fix the deleted-user write race in `PrismaUsersRepository.updateProfile` (transaction/isolation + retry, or stronger invariant).
3. Extract shared Prisma user select shape(s) to reduce duplication.
4. Centralize config parsing helpers (`asPositiveInt`) and (optionally) validate feature env overrides.
5. Introduce a single injectable `Clock` provider for infra jobs and module wiring.
