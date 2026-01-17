# Auth feature audit (app + domain only, infra excluded)

Date: 2026-01-17

## Scope

Included:
- `libs/features/auth/app/**`
- `libs/features/auth/domain/**`

Explicitly excluded (to audit later):
- `libs/features/auth/infra/**`

This report focuses on code quality (readability, maintainability, clean code) with a bias toward production safety (auth is security-critical).

## Snapshot

At a glance, the auth **app** layer is solid on boundaries (no NestJS/Prisma leaks) and has good security-aware patterns (dummy password hash, refresh token rotation + reuse detection). The main gaps are **cohesion** (a very large `AuthService`), **consistency** (time source + error codes), and one potentially serious **correctness risk** around the `DELETED` user status.

## What’s working well

- **Layering is respected**: `app/` and `domain/` contain no `@nestjs/*` or `@prisma/*` imports.
- **Security-conscious login flow**: `loginWithPassword` uses a `dummyPasswordHash` when user lookup fails to avoid timing leaks (`libs/features/auth/app/auth.service.ts`).
- **Refresh token rotation is explicit and readable**: reuse detection revokes the whole session (`libs/features/auth/app/auth.service.ts:419`).
- **Stable auth-specific error codes exist**: `AuthErrorCode` enum is comprehensive and readable (`libs/features/auth/app/auth.error-codes.ts`).
- **OIDC flows have direct unit test coverage**: `exchangeOidc` + `connectOidc` behavior is exercised (`libs/features/auth/app/auth.service.oidc.spec.ts`).

## Findings (prioritized)

### P0 — Correctness / policy gap: `DELETED` status isn’t handled in auth flows

Evidence:
- `AuthUserStatus` includes `'DELETED'` (`libs/features/auth/app/auth.types.ts:6`).
- `AuthService` only blocks `'SUSPENDED'` users (`libs/features/auth/app/auth.service.ts:115`, `:244`, `:436`) and never checks `'DELETED'`.

Why this matters:
- If the repository can return `status: 'DELETED'`, a deleted account may still be able to:
  - log in (`loginWithPassword`)
  - exchange OIDC tokens (`exchangeOidc`)
  - refresh tokens (`refresh`)
  - potentially interact with sessions via other app services (e.g. `AuthSessionsService` only checks “user exists”).

Recommendation:
- Decide and codify the invariant:
  - **Option A (preferred):** Treat `'DELETED'` as non-authenticatable everywhere in the app layer (explicit checks, similar to `'SUSPENDED'`).
  - **Option B:** If infra guarantees deleted users are never returned, then remove `'DELETED'` from `AuthUserStatus` in app types to reduce cognitive load (and document the invariant).
- Whichever option you choose, make it **impossible to regress** with a focused unit test.

Implemented (2026-01-17):
- Added explicit `'DELETED'` handling in auth app services: `libs/features/auth/app/auth.service.ts`, `libs/features/auth/app/auth-sessions.service.ts`, `libs/features/auth/app/auth-push-tokens.service.ts`.
- Added regression tests: `libs/features/auth/app/auth.service.deleted-user.spec.ts`.

### P1 — Maintainability: `AuthService` is too large and does too much

Evidence:
- `libs/features/auth/app/auth.service.ts` is ~666 LOC and contains:
  - password register/login
  - OIDC exchange/connect
  - password change
  - refresh/logout
  - email verification
  - password reset
  - JWKS read
  - session creation + refresh token minting

Why this matters:
- The class is already acting as a “god service”. It’s harder to:
  - reason about invariants (status checks, token issuance rules, session lifecycle)
  - extend without breaking unrelated flows
  - test small behaviors without mocking a lot

Recommendation (incremental, low-risk):
- Extract small cohesive helpers first (no architecture refactor required), e.g.:
  - `issueSessionAndTokensForUser(...)` used by register/login/oidc
  - `assertUserIsAuthenticatable(user)` (covers `SUSPENDED`/`DELETED` policy once)
- If you want a bigger cleanup later, split by capability:
  - `PasswordAuthService`, `OidcAuthService`, `SessionTokensService` (still behind one façade if needed).

### P1 — Consistency: time source is inconsistent across auth app services

Evidence (current):
- `AuthService` uses injected `Clock` (`libs/features/auth/app/auth.service.ts:33`).
- `AuthSessionsService` uses injected `Clock` (`libs/features/auth/app/auth-sessions.service.ts:44`).
- `AuthPushTokensService` uses injected `Clock` (`libs/features/auth/app/auth-push-tokens.service.ts:7`).

Why this matters:
- Inconsistency increases mental overhead and makes deterministic tests harder.
- “Now” becomes ambiguous (injected vs created vs passed), which is easy to get subtly wrong in edge cases.

Recommendation:
- Standardize on one approach for the auth app layer:
  - **Option A:** Inject `Clock` into all auth app services (most consistent with current `AuthService`).
  - **Option B:** Require `now` as an input for all time-sensitive methods.
- Do not mix the styles unless there’s a strong reason.

Implemented (2026-01-17):
- Standardized on **Option A** (inject `Clock` into auth app services).
- Removed `now` from `AuthPushTokensService` public method inputs (now derived from `Clock`).

### P2 — Type safety / readability: error codes are untyped strings in `AuthError`

Evidence:
- `AuthError.code` is `string` (`libs/features/auth/app/auth.errors.ts:5`).
- Raw string literals are used for platform-level codes (`'UNAUTHORIZED'`, `'VALIDATION_FAILED'`) in multiple places (`libs/features/auth/app/auth.service.ts:325`, `:359`, `:396`, `:563`, `:621`; `libs/features/auth/app/auth-sessions.service.ts:51`, `:80`; `libs/features/auth/app/auth-push-tokens.service.ts:16`).

Why this matters:
- Harder to guarantee “stable codes” and avoid typos.
- You already have `AuthErrorCode`, so the current `string` type loses most of the benefit.

Recommendation:
- Tighten `AuthError.code` to a union (e.g. `AuthErrorCode | ErrorCode`) and prefer enum references over string literals.
- Optionally add small helpers (`unauthorized()`, `validationFailed(issues)`) to remove repetitive boilerplate.

### P2 — Clean boundaries (later, when infra is in-scope): app outputs mix DTO-ish formatting

Evidence:
- `AuthSessionsService` returns `SessionView` with ISO string fields (`libs/features/auth/app/auth-sessions.service.ts:11-23`, `:57-69`).

Why this matters:
- App-layer mapping to “JSON-ready” strings makes it harder to change transport shape and makes reuse in non-HTTP contexts less clean.

Recommendation:
- When auditing infra, consider moving date serialization into HTTP DTO mapping and keep app results as `Date` values.

## Suggested next steps (smallest-first)

1. **Done (P0):** Treat `'DELETED'` as non-authenticatable in auth app services + regression tests.
2. **Done (P1):** Normalize time handling (standardized on `Clock`).
3. **P1:** Extract a couple of private helpers from `AuthService` to reduce duplication and centralize invariants.
4. **P2:** Type error codes and remove raw string usage where practical.
5. **Later:** Infra audit (controllers, Prisma repo, argon2 integration, OpenAPI snapshot impact).

## Notes on checks

This is a static audit (manual read + repo-wide search) limited to `app/` + `domain/`. No infra behavior or OpenAPI snapshot correctness is assessed here.
