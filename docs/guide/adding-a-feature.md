# Adding a Feature (Vertical Slice)

This guide shows the expected structure for new business capabilities.

## Rule: Feature Owns Its Slice

A feature should own:

- `domain`: pure rules + invariants
- `app`: use-cases + ports (interfaces)
- `infra`: adapters (Prisma repo, BullMQ jobs, HTTP controllers)

## Steps

1. Define the domain model

- Create domain types and invariants.
- Keep it pure (no Nest/Prisma/Redis imports).

2. Define use-cases (app layer)

- Create use-case(s) that orchestrate domain + ports.
- Define repository/service interfaces (“ports”) required by the use-case.

3. Implement infra adapters

- Implement Prisma repositories that satisfy the ports.
- Implement queue producers/consumers if background work is needed.

4. Expose HTTP endpoints (API app)

- Add controllers/modules in the API app wiring.
- Use DTOs + validation and follow the response/error standards.

### RBAC wiring checklist

When a feature exposes protected endpoints, wire RBAC at the route boundary:

- [ ] Import `PlatformAuthModule` (for `AccessTokenGuard` + `@CurrentPrincipal()`).
- [ ] Import `PlatformRbacModule` (for `RbacGuard` + `@RequirePermissions()`).
- [ ] Apply `@UseGuards(AccessTokenGuard, RbacGuard)` (authenticate first, then authorize).
- [ ] Set baseline permissions on the controller and add per-handler requirements as needed (`@RequirePermissions(...)` is additive).
- [ ] Add OpenAPI auth + errors: `@ApiBearerAuth('access-token')` and include `UNAUTHORIZED`/`FORBIDDEN` in `@ApiErrorCodes([...])`.
- [ ] Remember: roles normally come from the access token (`roles: string[]`); default is `["USER"]`; unknown roles grant nothing. For `/v1/admin/*`, roles are hydrated from the DB to ensure immediate demotion/promotion.
- [ ] Use escape hatches intentionally: `@Public()` (skips auth+rbac) and `@SkipRbac()` (skips RBAC only; rare).

See `docs/guide/adding-an-endpoint.md` for copy-paste examples.

5. Tests

- Unit test domain + use-cases.
- Add integration tests for repositories (real Postgres).
- Add e2e tests for key flows (HTTP).

6. Docs + OpenAPI

- Update standards references if you introduce new error codes.
- Ensure OpenAPI is generated and contract gates pass.
