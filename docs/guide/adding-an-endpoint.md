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
3. Use `@CurrentPrincipal()` to access the authenticated principal (`userId`, `sessionId`, `emailVerified`, `roles`).
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

Also ensure the controller’s Nest module imports `PlatformAuthModule` (and `PlatformRbacModule` if using RBAC) so guards/providers are available via DI.

## Protecting Endpoints (RBAC Permissions)

Endpoints that require specific permissions should apply RBAC after authentication:

1. Add `@UseGuards(AccessTokenGuard, RbacGuard)`.
2. Add `@RequirePermissions('<resource>:<action>')` on the controller and/or handler.
3. Include `FORBIDDEN` in `@ApiErrorCodes([...])`.

Example (controller method):

```ts
@UseGuards(AccessTokenGuard, RbacGuard)
@ApiBearerAuth('access-token')
@RequirePermissions('users:read')
@ApiErrorCodes([ErrorCode.UNAUTHORIZED, ErrorCode.FORBIDDEN, ErrorCode.INTERNAL])
@Get('users')
listUsers() {
  return { items: [], nextCursor: undefined };
}
```

Note: for `/v1/admin/*` endpoints, `RbacGuard` hydrates roles from the database on each request to ensure immediate demotion/promotion. You can also opt-in explicitly via `@UseDbRoles()` on other controllers/handlers if needed.

Escape hatches (when needed):

- `@Public()` marks an endpoint as unauthenticated (skips access-token guard and RBAC when present).
- `@SkipRbac()` skips RBAC checks (rare; use for migrations/internal endpoints).

## Write Safety (Idempotency-Key)

If a **write** endpoint (`POST`/`PUT`/`PATCH`/`DELETE`) may be retried by clients (mobile, web, proxies), protect it with an **idempotency key** so retries don’t create duplicate side effects.

Backend supports this via Redis-backed idempotency:

1. Add `@Idempotent({ scopeKey: '<stable-operation-key>' })` on the handler (recommended: reuse your `operationId`).
2. Document the header with `@ApiIdempotencyKeyHeader({ required: false })` (optional by default).
3. Include `IDEMPOTENCY_IN_PROGRESS` and `CONFLICT` in `@ApiErrorCodes([...])`.
4. Clients should send `Idempotency-Key: <uuid>` and reuse the same key on retries.

Example (controller method):

```ts
@UseGuards(AccessTokenGuard)
@ApiBearerAuth('access-token')
@ApiIdempotencyKeyHeader({ required: false })
@Idempotent({ scopeKey: 'users.me.patch' })
@ApiErrorCodes([
  ErrorCode.VALIDATION_FAILED,
  ErrorCode.UNAUTHORIZED,
  ErrorCode.IDEMPOTENCY_IN_PROGRESS,
  ErrorCode.CONFLICT,
  ErrorCode.INTERNAL,
])
@Patch('me')
patchMe(@CurrentPrincipal() principal: AuthPrincipal, @Body() body: PatchMeRequestDto) {
  return this.users.updateMeProfile(principal.userId, body.profile);
}
```

See `docs/engineering/auth/token-refresh-and-request-retry.md` for client retry guidance.

## Common Pitfalls

- Returning “raw” objects without the envelope
- Throwing framework exceptions without mapping to problem-details
- Adding new error codes without documenting them in OpenAPI
- Implementing ad-hoc pagination/filter formats
- Duplicating response mapping (prefer `app` to return a `*View` and keep controllers thin)
