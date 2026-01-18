# Error Codes Standard

Error codes are stable identifiers for programmatic error handling. They are part of the API contract and must not change casually.

## Rules

- Every error response includes a `code`.
- Codes are stable over time; do not rename or reuse codes for different meanings.
- Codes are UPPER_SNAKE_CASE.
- Each endpoint must document its possible codes in OpenAPI via `x-error-codes`.

## Namespacing

Use one of these patterns:

1. **Global** (cross-cutting) codes:

- `INTERNAL`
- `VALIDATION_FAILED`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `RATE_LIMITED`
- `IDEMPOTENCY_IN_PROGRESS`

2. **Feature-specific** codes:

`<FEATURE>_<REASON>`

Examples:

- `AUTH_INVALID_CREDENTIALS`
- `AUTH_EMAIL_NOT_VERIFIED`
- `AUTH_REFRESH_TOKEN_REVOKED`
- `USERS_EMAIL_ALREADY_EXISTS`

Guideline: prefer explicit feature codes once a consumer needs to branch on the reason.

## Validation Errors

Validation failures should use:

- `code`: `VALIDATION_FAILED`
- `errors[]`: list of `{ field, message }`

## Unknown / Unexpected Errors

Unexpected errors must:

- Use `code`: `INTERNAL`
- Use a generic `title/detail`
- Include `traceId` for correlation

## OpenAPI Annotation

Each operation must include:

```yaml
x-error-codes:
  - VALIDATION_FAILED
  - UNAUTHORIZED
  - FORBIDDEN
  - INTERNAL
```

The set must match reality; CI will treat this as contract.

## Implementation (TypeScript)

Rules:

- Use `ErrorCode` from `libs/shared/error-codes.ts` for global codes.
- Use a feature enum (e.g., `AuthErrorCode`, `UsersErrorCode`) for feature-specific codes.
- Feature error classes must type `code` as a union of global + feature codes (e.g., `AuthErrorCode | ErrorCode`) and must not accept raw strings.
