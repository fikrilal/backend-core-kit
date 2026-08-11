# Auth Capability Split Roadmap

- Status: planning
- Date: 2026-08-08
- Scope: high-level sequencing for reorganizing `libs/features/auth`
- Related ADR: `docs/adr/0018-progressive-feature-architecture.md`

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
  auth.tokens.ts

  shared/
    auth.config.ts
    auth.error-codes.ts
    auth.errors.ts
    auth.repository.ts
    auth.types.ts
    auth-user-state.ts
    auth.service.helpers.ts
    time.ts
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
    refresh-token.ts
    jwks.controller.ts

  password/
    password-auth.controller.ts
    password-auth.dto.ts
    password-auth.service.ts

  oidc/
    oidc.controller.ts
    oidc.dto.ts
    oidc.service.ts
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

- `libs/features/auth/app/auth-email-verification.service.ts`
- `libs/features/auth/app/email-verification-token.ts`
- `libs/features/auth/infra/jobs/auth-email-verification.job.ts`
- `libs/features/auth/infra/jobs/auth-email-verification.jobs.ts`
- `libs/features/auth/infra/http/auth.controller.ts` handlers:
  - `POST /v1/auth/email/verify`
  - `POST /v1/auth/email/verification/resend`
- `libs/features/auth/infra/rate-limit/redis-email-verification-rate-limiter.ts`
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

- `libs/features/auth/app/auth-password-reset.service.ts`
- `libs/features/auth/app/password-reset-token.ts`
- `libs/features/auth/infra/jobs/auth-password-reset.job.ts`
- `libs/features/auth/infra/jobs/auth-password-reset.jobs.ts`
- `libs/features/auth/infra/http/auth.controller.ts` handlers:
  - `POST /v1/auth/password/reset/request`
  - `POST /v1/auth/password/reset/confirm`
- `libs/features/auth/infra/rate-limit/redis-password-reset-rate-limiter.ts`
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

- `libs/features/auth/app/auth-push-tokens.service.ts`
- `libs/features/auth/infra/http/me-push-token.controller.ts`
- `libs/features/auth/infra/http/dtos/me-push-token.dto.ts`
- `libs/features/auth/infra/http/me-push-token.controller.spec.ts`

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

- `libs/features/auth/app/auth-session-lifecycle.service.ts`
- `libs/features/auth/app/auth-sessions.service.ts`
- `libs/features/auth/app/refresh-token.ts`
- `libs/features/auth/infra/http/me-sessions.controller.ts`
- `libs/features/auth/infra/http/dtos/me-sessions.dto.ts`
- `libs/features/auth/infra/http/jwks.controller.ts`
- refresh/logout handlers currently in `auth.controller.ts`

Expected outcome:

```text
libs/features/auth/sessions/
  sessions.controller.ts
  sessions.dto.ts
  sessions.service.ts
  session-lifecycle.service.ts
  refresh-token.ts
  jwks.controller.ts
```

Risk notes:

- refresh rotation and token reuse detection are security-sensitive;
- this phase needs broader auth e2e coverage than earlier phases.

### Phase 5 — Password auth

Move password registration/login/change after session lifecycle is isolated.

Current files:

- `libs/features/auth/app/auth-password-auth.service.ts`
- password register/login/change handlers currently in `auth.controller.ts`
- `libs/features/auth/infra/http/dtos/auth.dto.ts` password-related DTOs
- `libs/features/auth/infra/http/dtos/password-policy.ts`
- `libs/features/auth/infra/rate-limit/redis-login-rate-limiter.ts`

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

- `libs/features/auth/app/auth-oidc-auth.service.ts`
- OIDC exchange/connect handlers currently in `auth.controller.ts`
- `libs/features/auth/infra/security/google-oidc-id-token-verifier.ts`

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

Candidates:

- move common DTOs out of old `infra/http/dtos/auth.dto.ts`;
- split large DTO files by capability if not already done;
- decide whether the repository facade should remain one class or become
  capability-specific facades;
- review whether `AuthService` is still useful as a facade or should disappear;
- remove obsolete compatibility re-export files after imports settle.

Do this last. Shared cleanup is where accidental behavior changes usually sneak
in.

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
- [ ] Phase 4 — Sessions and JWKS
- [ ] Phase 5 — Password auth
- [ ] Phase 6 — OIDC
- [ ] Phase 7 — Shared cleanup
