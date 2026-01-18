# ADR: Standardize App Error Types and Time Source

- Status: Accepted
- Date: 2026-01-18
- Decision makers: Core kit maintainers

## Context

Across features (Auth/Users/Admin), we repeatedly need:

- Stable, documented error `code` values (global + feature-specific) that align with `docs/standards/error-codes.md`.
- Deterministic time behavior for correctness and unit testability.
- Consistent HTTP mapping from app-layer errors to RFC7807 (`ProblemException` + `ProblemDetailsFilter`) without duplicating controller boilerplate.

Without a shared standard, we observed drift risks:

- Raw string codes (`'NOT_FOUND'`, `'VALIDATION_FAILED'`) appearing in app services.
- Feature error classes typing `code` as `string`, losing compile-time guarantees.
- Ad-hoc `new Date()` / `Date.now()` usage in app services, making tests rely on fake timers or “approx now” assertions.
- Inconsistent infra patterns (manual controller mapping vs exception filters).

## Decision

1. **Error codes (TypeScript)**
   - Global error codes must use `ErrorCode` (`libs/shared/error-codes.ts`).
   - Feature-specific error codes must use a feature enum (e.g., `AuthErrorCode`, `UsersErrorCode`, `AdminErrorCode`).
   - Feature error classes must type `code` as a union of global + feature codes (e.g., `UsersErrorCode | ErrorCode`) and must not accept raw strings.

2. **Time handling**
   - App services must not call `new Date()` / `Date.now()` directly.
   - App services should depend on an injected `Clock` (`libs/shared/time.ts`) and derive `now` from it.
   - Ports/repositories should accept `now` explicitly when persistence must be deterministic.

3. **HTTP mapping**
   - Infra should map feature errors to RFC7807 using a feature-scoped exception filter (`@UseFilters(...)`) rather than per-endpoint mapping boilerplate.

## Rationale

- Compile-time enforcement for error code stability reduces contract drift and review overhead.
- A single time source (`Clock`) improves determinism and makes tests simpler and less flaky.
- Exception filters reduce repetition and keep controllers focused on request/response concerns.

## Consequences

Positive:

- Fewer regressions caused by typos or inconsistent error codes.
- More testable app services without global time stubbing.
- Cleaner controllers and consistent problem-details mapping.

Costs:

- Small refactors to replace raw string codes with enums and to inject `Clock` where needed.
- Minor mechanical migration when introducing filters or shared utilities.

## Alternatives Considered

- Keep feature-specific patterns and rely on review discipline (rejected due to repeated drift).
- Use free-form `string` codes in app errors and validate only at the HTTP boundary (rejected: drift moves later and becomes harder to detect).
- Use Jest fake timers universally instead of `Clock` injection (rejected: higher cognitive overhead and more brittle tests).

## Links / References

- Related docs:
  - `docs/standards/error-codes.md`
  - `docs/standards/api-response-standard.md`
  - `docs/standards/code-quality.md`
- Related code:
  - `libs/shared/error-codes.ts`
  - `libs/shared/time.ts`
