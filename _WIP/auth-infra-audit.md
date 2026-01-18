# Auth infra audit (HTTP + persistence + workers)

Date: 2026-01-18

## Scope

Included:

- `libs/features/auth/infra/**` (Nest module wiring, HTTP controllers + DTOs, Prisma repository, security adapters, Redis rate limiters, job producers)
- Auth job processor (adjacent infra): `apps/worker/src/jobs/auth-email-verification.worker.ts` and `apps/worker/src/jobs/auth-email-verification.worker.spec.ts`

Excluded:

- `libs/platform/**` (treated as “core infra”; audited separately)
- Non-auth features (except where auth infra is coupled to them)

This report focuses on code quality (readability, maintainability, complexity) and alignment with:

- `docs/standards/api-response-standard.md`
- `docs/standards/error-codes.md`
- `docs/standards/authentication.md`
- `docs/engineering/auth/*`

## Snapshot

Auth infra is generally high quality and disciplined:

- controllers match the response envelope + RFC7807 error standards
- persistence is cautious about concurrency (serializable transactions + retries where needed)
- abuse protection matches the engineering docs (hashed Redis keys, cooldowns, IP blocks)

The biggest risks are **complexity hotspots** (a 1.1k LOC Prisma repository + large controller), plus some **contract drift** (DTO validation vs configured password policy), and a **policy gap** in the worker (email jobs don’t check user status).

## What’s working well

- **API response standard is implemented by infra, not by hand**:
  - Controllers return plain objects/arrays; `ResponseEnvelopeInterceptor` envelopes responses and auto-paginates `{ items, limit, nextCursor }` (`libs/platform/http/interceptors/response-envelope.interceptor.ts`).
  - Exceptions like JWKS correctly opt out via `@SkipEnvelope()` (`libs/features/auth/infra/http/jwks.controller.ts`).
- **Problem Details (RFC7807) is consistent**:
  - Controllers translate `AuthError` into `ProblemException`, which the global filter renders as `application/problem+json` with `traceId` (`libs/platform/http/filters/problem-details.filter.ts`).
- **OIDC exchange/connect aligns with docs**:
  - issuer/audience verification and required-claim checks match `docs/engineering/auth/oidc-google.md` (`libs/features/auth/infra/security/google-oidc-id-token-verifier.ts`).
- **Abuse protection aligns with docs**:
  - hashed Redis keys, cooldowns, and IP blocks match `docs/engineering/auth/auth-abuse-protection.md` (`libs/features/auth/infra/rate-limit/*.ts`).
- **Persistence is concurrency-aware**:
  - serializable transactions + retry loops are used for race-prone operations (token consumption, password reset, push token upsert) (`libs/features/auth/infra/persistence/prisma-auth.repository.ts`).

## Findings (prioritized)

### P0 — Policy / correctness: auth email worker sends emails without checking user status

Evidence:

- Worker queries do not select/check `User.status` (`apps/worker/src/jobs/auth-email-verification.worker.ts`).
- Password reset request path can target any `User` found by email; infra does not explicitly exclude `DELETED` users (end-to-end behavior depends on app layer + DB state).

Why this matters:

- If `DELETED` is a meaningful state (and it is in app types), sending verification/reset emails to deleted accounts is surprising at best and can violate “don’t contact deleted users” expectations.
- It also complicates the “no account enumeration” story: the API returns 204, but the email side-effect is still observable by the mailbox owner.

Recommendation:

- In `AuthEmailsWorker`, select `status` and **skip** sending for non-authenticatable users (at minimum `DELETED`; likely also `SUSPENDED` depending on policy).
- Consider making `AuthService.requestPasswordReset` treat `DELETED` as “not found” (return `null`) to prevent enqueuing jobs in the first place (app-layer change, but simplifies infra).

Implemented (2026-01-18):

- `AuthEmailsWorker` now selects `User.status` and skips verification/password-reset emails for `DELETED` users:
  - `apps/worker/src/jobs/auth-email-verification.worker.ts`
  - Regression tests: `apps/worker/src/jobs/auth-email-verification.worker.spec.ts`

### P1 — Maintainability: duplicated AuthError → ProblemException mapping across controllers

Evidence:

- `AuthController`, `MeSessionsController`, and `MePushTokenController` each have `mapAuthError()` and `titleForStatus()` (same shape, small variations) (`libs/features/auth/infra/http/*.controller.ts`).

Why this matters:

- Repetition increases drift risk (e.g., one controller forgets to map a new `AuthErrorCode` to a title or drops `issues[]`).
- Every new auth controller will copy/paste more boilerplate.

Recommendation (low-risk):

- Introduce a single `AuthProblemExceptionFilter` (or helper) that:
  - maps `AuthError` to `ProblemException` (including `issues[]`)
  - uses a consistent title strategy (ideally aligning with `ProblemDetailsFilter.statusTitle`)
- Apply it via `@UseFilters(AuthProblemExceptionFilter)` at the controller level to stay explicit (minimizes “magic”).

Implemented (2026-01-18):

- Added `AuthErrorFilter` to map `AuthError` → `ProblemException` and delegate rendering to `ProblemDetailsFilter`:
  - `libs/features/auth/infra/http/auth-error.filter.ts`
- Applied it at the controller level and removed duplicated `mapAuthError/titleForStatus` helpers:
  - `libs/features/auth/infra/http/auth.controller.ts`
  - `libs/features/auth/infra/http/me-sessions.controller.ts`
  - `libs/features/auth/infra/http/me-push-token.controller.ts`

### P1 — Maintainability: `PrismaAuthRepository` is a 1.1k LOC “mega-repo”

Evidence:

- `libs/features/auth/infra/persistence/prisma-auth.repository.ts` was ~1143 LOC and contained:
  - mapping functions + Prisma enum adapters
  - cursor pagination builder logic (sessions)
  - multiple transaction retry loops
  - refresh rotation logic + session revocation helpers
  - push token upsert logic with serializable isolation

Why this matters:

- High cognitive load: difficult to confidently change one behavior without scanning unrelated logic.
- Harder to test in slices; easiest test becomes E2E, which slows iteration.

Recommendation:

- Split by responsibility into multiple files (still one exported class if you want):
  - `prisma-auth.repository.mappers.ts`
  - `prisma-auth.repository.sessions.ts` (list/revoke/activeKey)
  - `prisma-auth.repository.refresh-tokens.ts` (find/rotate/revoke)
  - `prisma-auth.repository.credentials.ts` (password change/reset)
- Extract a shared `withSerializableRetry(maxAttempts, fn)` helper to remove repeated retry loops and make failures consistently logged/handled.

Implemented (2026-01-18):

- Split `PrismaAuthRepository` into cohesive modules and reduced the entrypoint file to a small façade:
  - `libs/features/auth/infra/persistence/prisma-auth.repository.ts` (facade; ~195 LOC)
  - `libs/features/auth/infra/persistence/prisma-auth.repository.users.ts`
  - `libs/features/auth/infra/persistence/prisma-auth.repository.sessions.ts`
  - `libs/features/auth/infra/persistence/prisma-auth.repository.credentials.ts`
  - `libs/features/auth/infra/persistence/prisma-auth.repository.refresh-tokens.ts`
- Extracted shared helpers to remove duplicated logic:
  - `libs/features/auth/infra/persistence/prisma-auth.repository.tx.ts` (`withSerializableRetry`, retryable transaction detection)
  - `libs/features/auth/infra/persistence/prisma-auth.repository.mappers.ts` (Prisma ↔ app record mapping)
  - `libs/features/auth/infra/persistence/prisma-auth.repository.prisma-errors.ts` (unique constraint detection)

### P1 — Contract drift: password DTO validation doesn’t match configured policy

Evidence:

- `PasswordRegisterRequestDto.password` has OpenAPI `minLength: 10` but class-validator `@MinLength(1)` (`libs/features/auth/infra/http/dtos/auth.dto.ts`).
- Similar for `ChangePasswordRequestDto.newPassword` and reset confirm DTO.

Why this matters:

- OpenAPI advertises constraints that the runtime validator doesn’t enforce (clients get surprising 400s from deeper layers).
- It weakens “contract gates” value: constraints should be accurate at the edge.

Recommendation:

- Make DTO constraints match the kit default (`AUTH_PASSWORD_MIN_LENGTH` default 10) by setting `@MinLength(10)` and aligning `@ApiProperty({ minLength: 10 })`.
- If you truly want runtime-configurable policy, use a custom validator that reads config (more work) and document it explicitly.

Implemented (2026-01-18):

- Aligned password DTO constraints with the configured policy (`AUTH_PASSWORD_MIN_LENGTH`, default 10):
  - `libs/features/auth/infra/http/dtos/password-policy.ts`
  - `libs/features/auth/infra/http/dtos/auth.dto.ts`
- Regenerated OpenAPI snapshot after the contract change:
  - `docs/openapi/openapi.yaml`

### P2 — Consistency: repeated parsing helpers across infra (small but noisy)

Evidence:

- Multiple local copies of `asNonEmptyString`, `asPositiveInt`, `hashKey` across infra files.

Why this matters:

- Repetition increases drift and makes future tweaks (e.g. parsing rules) non-obvious.

Recommendation:

- Prefer relying on `libs/platform/config/env.validation.ts` (already does numeric parsing + min constraints).
- Where helpers are still needed, move them to a small shared utility (platform or shared) that fits boundary rules.

Implemented (2026-01-18):

- Centralized common rate limiter helpers (`hashKey`, `asPositiveInt`, `getRetryAfterSeconds`):
  - `libs/features/auth/infra/rate-limit/rate-limit.utils.ts`

### P2 — “Nice to have”: improve 429 ergonomics with `Retry-After`

Evidence:

- Rate limiters return a `429` `RATE_LIMITED` error, but no `Retry-After` header is set (also called out in docs).

Recommendation:

- Add `Retry-After` consistently for rate limited responses (likely at the HTTP layer via an interceptor/filter so it’s uniform).

Implemented (2026-01-18):

- Added `Retry-After` for auth rate limited responses (best-effort based on Redis TTL):
  - `libs/features/auth/app/auth.errors.ts` (added `retryAfterSeconds`)
  - `libs/features/auth/infra/http/auth-error.filter.ts` (sets header when provided)
  - `libs/features/auth/infra/rate-limit/*.ts` (populate `retryAfterSeconds` from TTL)
  - Docs: `docs/engineering/auth/auth-abuse-protection.md`

## Standards alignment checklist

- **Architecture boundaries:** OK (infra imports app + platform; app/domain remain framework-free).
- **Success envelope:** OK (`ResponseEnvelopeInterceptor` + `@SkipEnvelope` for JWKS).
- **Error shape:** OK (Problem Details filter). Improvement: centralize `AuthError` mapping.
- **OpenAPI error codes:** Looks consistent via `@ApiErrorCodes(...)` in controllers; keep this in sync whenever adding new failure modes.
- **Token strategy:** OK (asymmetric JWT + JWKS; refresh tokens opaque + hashed; rotation + reuse detection).

## Proposed backlog (infra-focused)

1. **P0 (done):** Skip auth emails for `DELETED` users in `AuthEmailsWorker` (and optionally upstream prevent enqueue).
2. **P1 (done):** Add an auth error filter to delete duplicate `mapAuthError/titleForStatus` boilerplate.
3. **P1 (done):** Split `PrismaAuthRepository` by responsibility + add a shared serializable retry helper.
4. **P1 (done):** Align DTO password constraints with configured policy (or document why not).
5. **P2 (done):** Optional ergonomics (`Retry-After` for 429, shared parsing helpers).

## Notes on checks

This is a static audit (manual read + search). I did not run E2E flows; infra behavior is inferred from code + existing worker/unit tests.
