# Adding an Endpoint

This guide standardizes the shape of endpoints so clients can be consistent across services.

## Checklist

- [ ] Route is versioned (e.g., `/v1/...`) unless explicitly excluded
- [ ] DTOs validate input (whitelist + forbid unknown fields)
- [ ] Response uses `{ data, meta? }` envelope
- [ ] Errors are RFC7807 with `code` + `traceId` (+ optional `otelTraceId`)
- [ ] If endpoint is authenticated: guard + OpenAPI bearer scheme are applied
- [ ] Pagination/filter/sort follow standard conventions when listing
- [ ] OpenAPI decorators document request/response and `x-error-codes`
- [ ] E2E test asserts envelope + error shape + `X-Request-Id`

## Protecting Endpoints (Access Tokens)

Endpoints that require an authenticated user must validate a **first-party access token** from:

- `Authorization: Bearer <access-token>`

Pattern:

1. Add `@UseGuards(AccessTokenGuard)` (rejects missing/invalid tokens with RFC7807 `UNAUTHORIZED`).
2. Add `@ApiBearerAuth('access-token')` so Swagger UI “Authorize” works.
3. Use `@CurrentPrincipal()` to access the authenticated principal (`userId`, `sessionId`, `emailVerified`).
4. Include `UNAUTHORIZED` in `@ApiErrorCodes([...])`.

Example (controller method):

```ts
@UseGuards(AccessTokenGuard)
@ApiBearerAuth('access-token')
@ApiErrorCodes([ErrorCode.UNAUTHORIZED, ErrorCode.INTERNAL])
@Get('me')
getMe(@CurrentPrincipal() principal: AuthPrincipal) {
  return { id: principal.userId, emailVerified: principal.emailVerified };
}
```

Note: import paths depend on where the controller lives; the symbols come from `libs/platform/auth/*` and `libs/platform/http/*`.

## Common Pitfalls

- Returning “raw” objects without the envelope
- Throwing framework exceptions without mapping to problem-details
- Adding new error codes without documenting them in OpenAPI
- Implementing ad-hoc pagination/filter formats
