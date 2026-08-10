# Auth Capability Split Roadmap

- Status: complete
- Date: 2026-08-08
- Scope: high-level sequencing for reorganizing `libs/features/auth`
- Related ADR: `docs/adr/0018-progressive-feature-architecture.md`

> **Completion note (2026-08-08):** All seven phases are implemented and
> verified. `libs/features/auth` is now capability-oriented with a `shared/`
> layer (`auth.module.ts` at the root; `email-verification/`, `password/`,
> `password-reset/`, `push-tokens/`, `sessions/`, `oidc/`; shared contracts,
> ports, persistence, security, and rate-limit under `shared/`). The
> `AuthService` facade and the old `app/`/`infra/`/`domain/` trees were
> removed. Endpoint paths, operation IDs, tags, schemas, and error codes are
> unchanged. Each phase has a completed execution plan under
> `docs/exec-plans/completed/`. The file lists below reflect each phase's
> starting point (pre-move); current locations are shown in the Target Shape
> above.

## Purpose

Auth is currently the largest and highest-cognitive-load feature slice. The
files are mostly reasonable individually, but too many capabilities live under
one technical-layer tree:

- password registration/login/change;
- OIDC exchange/connect;
- session lifecycle, refresh rotation, logout, JWKS;
- email verification;
- password reset;
- push tokens;
- abuse/rate limiting;
- token issuance and password hashing adapters;
- shared persistence repository internals.

The goal is to split auth by capability without changing behavior. This roadmap
keeps the work trackable while each phase gets its own execution plan.

## Non-goals

- Do not change public API behavior.
- Do not change token semantics, refresh rotation, password hashing, OIDC
  linking, rate limits, or job semantics during folder moves.
- Do not change Prisma schema or migrations.
- Do not rewrite the auth repository behavior as part of the first capability
  moves.
- Do not split everything in one PR/task.

## Target Shape

Keep one public `AuthModule` so API wiring remains stable:

```text
libs/features/auth/
  auth.module.ts

  shared/
    auth.dto.ts
    auth-error.filter.ts
    auth.errors.ts
    auth.model.ts
    auth.service.helpers.ts
    auth.tokens.ts
    ports/
      auth.ports.ts
      auth.repository.ts
    persistence/
      prisma-auth.repository.ts
      prisma-auth.repository.*.ts
    security/
      argon2.password-hasher.ts
      crypto-access-token-issuer.ts
      google-oidc-id-token-verifier.ts
    rate-limit/
      rate-limit.utils.ts
      redis-login-rate-limiter.ts
      redis-email-verification-rate-limiter.ts
      redis-password-reset-rate-limiter.ts

  email-verification/
    email-verification.controller.ts
    email-verification.dto.ts
    email-verification.service.ts
    email-verification-token.ts
    email-verification.job.ts
    email-verification.jobs.ts

  password-reset/
    password-reset.controller.ts
    password-reset.dto.ts
    password-reset.service.ts
    password-reset-token.ts
    password-reset.job.ts
    password-reset.jobs.ts

  push-tokens/
    push-token.controller.ts
    push-token.dto.ts
    push-tokens.service.ts

  sessions/
    sessions.controller.ts
    sessions.dto.ts
    sessions.service.ts
    session-lifecycle.service.ts
    jwks.controller.ts

  password/
    password-auth.controller.ts
    password-auth.dto.ts
    password-auth.service.ts

  oidc/
    oidc.controller.ts
    oidc.dto.ts
    oidc-auth.service.ts
```

This target is intentionally capability-oriented. It does not require each
capability to become an isolated Nest module immediately. The first split should
keep provider wiring centralized in `AuthModule` unless local submodules clearly
reduce complexity.

## Invariants

- `AuthModule` remains the public Nest module imported by `apps/api`.
- Existing endpoint paths, operation IDs, response envelopes, problem details,
  and `x-error-codes` remain stable.
- Worker job contracts remain stable or are updated mechanically with import-only
  changes.
- Existing feature-specific `AuthError` and `AuthErrorFilter` remain in use until
  a specific phase intentionally replaces them.
- The Prisma auth repository facade remains intact for initial moves.
- Security-sensitive logic moves with tests and without semantic edits.
- Each phase must pass targeted tests plus lint/typecheck/dependency checks.
- OpenAPI must be generated and checked when controller/DTO imports or metadata
  move.

## Phase Order

### Phase 1 — Email verification

Move email verification first.

Current files:

- `libs/features/auth/email-verification/email-verification.service.ts`
- `libs/features/auth/email-verification/email-verification-token.ts`
- `libs/features/auth/email-verification/email-verification.job.ts`
- `libs/features/auth/email-verification/email-verification.jobs.ts`
- `libs/features/auth/infra/http/auth.controller.ts` handlers:
  - `POST /v1/auth/email/verify`
  - `POST /v1/auth/email/verification/resend`
- `libs/features/auth/shared/rate-limit/redis-email-verification-rate-limiter.ts`
- worker imports in `apps/worker/src/jobs/emails.*`

Why first:

- narrower than sessions/password/OIDC;
- exercises service, controller, jobs, rate limiter, worker imports, and OpenAPI;
- lower blast radius than login or refresh rotation.

Expected outcome:

```text
libs/features/auth/email-verification/
  email-verification.controller.ts
  email-verification.dto.ts
  email-verification.service.ts
  email-verification-token.ts
  email-verification.job.ts
  email-verification.jobs.ts
```

Keep `RedisEmailVerificationRateLimiter` in `shared/rate-limit/` or move it only
if the phase can do so as a pure import-only change.

### Phase 2 — Password reset

Move password reset after email verification establishes the pattern.

Current files:

- `libs/features/auth/password-reset/password-reset.service.ts`
- `libs/features/auth/password-reset/password-reset-token.ts`
- `libs/features/auth/password-reset/password-reset.job.ts`
- `libs/features/auth/password-reset/password-reset.jobs.ts`
- `libs/features/auth/infra/http/auth.controller.ts` handlers:
  - `POST /v1/auth/password/reset/request`
  - `POST /v1/auth/password/reset/confirm`
- `libs/features/auth/shared/rate-limit/redis-password-reset-rate-limiter.ts`
- worker imports in `apps/worker/src/jobs/emails.*`

Expected outcome:

```text
libs/features/auth/password-reset/
  password-reset.controller.ts
  password-reset.dto.ts
  password-reset.service.ts
  password-reset-token.ts
  password-reset.job.ts
  password-reset.jobs.ts
```

### Phase 3 — Push tokens

Move current-session push token registration/revocation.

Current files:

- `libs/features/auth/push-tokens/push-tokens.service.ts`
- `libs/features/auth/push-tokens/push-token.controller.ts`
- `libs/features/auth/push-tokens/push-token.dto.ts`
- `libs/features/auth/push-tokens/push-token.controller.spec.ts`

Expected outcome:

```text
libs/features/auth/push-tokens/
  push-token.controller.ts
  push-token.dto.ts
  push-tokens.service.ts
```

This phase is a good proving point for moving controller-local tests with the
capability.

### Phase 4 — Sessions and JWKS

Move session list/revoke/refresh/logout/JWKS only after smaller auth moves are
stable.

Current files:

- `libs/features/auth/sessions/session-lifecycle.service.ts`
- `libs/features/auth/sessions/sessions.service.ts`
- `libs/features/auth/shared/auth.model.ts` (refresh-token helpers)
- `libs/features/auth/sessions/sessions.controller.ts`
- `libs/features/auth/sessions/sessions.dto.ts`
- `libs/features/auth/sessions/jwks.controller.ts`
- refresh/logout handlers currently in `auth.controller.ts`

Expected outcome:

```text
libs/features/auth/sessions/
  sessions.controller.ts
  sessions.dto.ts
  sessions.service.ts
  session-lifecycle.service.ts
  jwks.controller.ts
```

`refresh-token.ts` moved to `shared/` (with the other shared auth primitives)
rather than staying in `sessions/`.

Risk notes:

- refresh rotation and token reuse detection are security-sensitive;
- this phase needs broader auth e2e coverage than earlier phases.

### Phase 5 — Password auth

Move password registration/login/change after session lifecycle is isolated.

Current files:

- `libs/features/auth/password/password-auth.service.ts`
- password register/login/change handlers currently in `auth.controller.ts`
- `libs/features/auth/infra/http/dtos/auth.dto.ts` password-related DTOs
- `libs/features/auth/password/password-auth.dto.ts`
- `libs/features/auth/shared/rate-limit/redis-login-rate-limiter.ts`

Expected outcome:

```text
libs/features/auth/password/
  password-auth.controller.ts
  password-auth.dto.ts
  password-auth.service.ts
```

Risk notes:

- login timing behavior, dummy password hash, and rate limiting must remain
  unchanged;
- registration still enqueues verification email through the capability moved in
  phase 1.

### Phase 6 — OIDC

Move OIDC exchange/connect last among auth entrypoints.

Current files:

- `libs/features/auth/oidc/oidc-auth.service.ts`
- OIDC exchange/connect handlers currently in `auth.controller.ts`
- `libs/features/auth/shared/security/google-oidc-id-token-verifier.ts`

Expected outcome:

```text
libs/features/auth/oidc/
  oidc.controller.ts
  oidc.dto.ts
  oidc.service.ts
```

Risk notes:

- account linking and provider identity uniqueness are security-sensitive;
- keep Google verifier under `shared/security/` initially unless moving it is a
  pure import-only change.

### Phase 7 — Shared cleanup

After entrypoints are capability-oriented, clean up shared auth internals.

Resolved (2026-08-08):

- common DTOs moved out of `infra/http/dtos/auth.dto.ts` into
  `shared/auth.dto.ts`;
- shared contracts, ports, persistence, security, and rate-limit consolidated
  under `shared/` (flat contract files plus role-based `ports/`, `persistence/`,
  `security/`, `rate-limit/` subfolders);
- the repository facade remains one class (`PrismaAuthRepository`) behind the
  `AuthRepository` port, split into per-aggregate implementation files;
- `AuthService` was removed as a facade; controllers inject capability services
  directly;
- compatibility re-export shims (`time.ts`, `tx.ts`, rate-limit utils
  re-exports) were removed;
- `app/`, `infra/`, and `domain/` trees were deleted; `auth.module.ts` lives at
  the feature root.

This was done last because shared cleanup is where accidental behavior changes
usually sneak in; each decision was verified with the full auth e2e suite.

## Per-Phase Execution Plan Requirements

Every phase should create its own file under `docs/exec-plans/active/`.

Minimum acceptance criteria per phase:

1. File moves are behavior-preserving.
2. `AuthModule` provider/controller wiring remains explicit and readable.
3. Existing endpoint paths and operation IDs remain unchanged.
4. OpenAPI generation/check passes when controllers or DTOs move.
5. Targeted unit/e2e tests for the capability pass.
6. `npm run lint`, `npm run typecheck`, and `npm run deps:check` pass.
7. Worker imports compile when jobs move.

Recommended per-phase verification:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run deps:check
npm test -- --runTestsByPath <targeted spec files>
npm run openapi:generate
npm run openapi:check
npm run openapi:lint
```

Use `npm run verify:e2e` when a phase changes behavior, persistence flow,
session semantics, queue execution, or anything static checks cannot prove.

## Import Compatibility Strategy

Prefer direct import updates inside each phase.

Use temporary compatibility re-exports only when a phase would otherwise become
too large to review safely. If added, every compatibility file must have a
follow-up removal phase or checklist item.

## Stop Conditions

Stop a phase and reassess if any of these happen:

- OpenAPI snapshot changes beyond import/order-only effects;
- endpoint behavior changes;
- auth e2e tests expose a semantic difference;
- worker job contract changes;
- dependency boundaries require weakening beyond ADR 0018;
- file moves require broad edits outside auth, worker imports, tests, and docs.

## Tracking

Phase status:

- [x] Phase 1 — Email verification
- [x] Phase 2 — Password reset
- [x] Phase 3 — Push tokens
- [x] Phase 4 — Sessions and JWKS
- [x] Phase 5 — Password auth
- [x] Phase 6 — OIDC
- [x] Phase 7 — Shared cleanup
