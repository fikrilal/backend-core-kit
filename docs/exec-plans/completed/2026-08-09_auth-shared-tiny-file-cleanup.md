# Auth Shared Tiny-File Cleanup

Date: 2026-08-09  
Owner: Codex  
Status: completed  
Risk class: medium  
Related issue/PR: N/A

## Objective

Reduce `libs/features/auth/shared` navigation noise after the auth capability
split by consolidating tiny primitive and port files without changing behavior,
OpenAPI contracts, dependency boundaries, or runtime wiring.

## Scope

- Consolidate tiny auth primitives into `auth.model.ts`.
- Consolidate tiny auth port files into `ports/auth.ports.ts`.
- Move the `AuthErrorCode` re-export into `auth.errors.ts`.
- Keep large or behavior-heavy files split:
  - persistence facade/split files;
  - Redis rate limiters;
  - security adapters;
  - OpenAPI DTOs;
  - Nest error filter.
- Fix stale auth abuse documentation paths.

## Acceptance Criteria

1. Removed tiny files no longer have code imports.
2. Typecheck, dependency boundaries, lint, format, OpenAPI checks, and focused
   auth tests pass.
3. OpenAPI snapshot remains unchanged.
4. No behavior code is changed beyond import-path consolidation.

## Completed Changes

- Added `libs/features/auth/shared/auth.model.ts` for auth config, email
  normalization, auth user/result types, and refresh-token helpers.
- Added `libs/features/auth/shared/ports/auth.ports.ts` for small service ports:
  access-token issuer, login rate limiter, OIDC verifier, and password hasher.
- Removed tiny standalone files:
  - `auth.config.ts`
  - `auth.error-codes.ts`
  - `auth.types.ts`
  - `email.ts`
  - `refresh-token.ts`
  - `ports/access-token-issuer.ts`
  - `ports/login-rate-limiter.ts`
  - `ports/oidc-id-token-verifier.ts`
  - `ports/password-hasher.ts`
- Updated auth abuse documentation to point at the new rate-limiter paths.

## Verification

Commands run:

```bash
npm run typecheck
npm run deps:check
npm run format:check
npm run lint
npm run openapi:check
npm run openapi:lint
npm run verify:project-map
npm test -- --runTestsByPath libs/features/auth/shared/auth.service.helpers.spec.ts libs/features/auth/password/password-auth.service.deleted-user.spec.ts libs/features/auth/oidc/oidc-auth.service.deleted-user.spec.ts libs/features/auth/sessions/session-lifecycle.service.deleted-user.spec.ts libs/features/auth/oidc/oidc-auth.service.spec.ts
```

Outcome: all completed commands passed.
