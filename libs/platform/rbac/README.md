# RBAC (Role-Based Access Control)

This folder contains the **platform RBAC scaffold** used by HTTP controllers to enforce authorization at the route boundary.

RBAC in this kit is intentionally simple:

- **Roles** live on the authenticated principal (`AuthPrincipal.roles`) and are carried in the **first-party access token**.
- For `/v1/admin/*` endpoints, roles are **hydrated from the database** on each request to ensure immediate demotion/promotion.
- **Permissions** are fine-grained capability strings: `<resource>:<action>`.
- Routes declare required permissions via decorators; a guard enforces them.
- Unknown roles grant nothing (deny-by-default).

Source of truth for the standard: `docs/standards/authorization-rbac.md`.

## Core Pieces

### `PlatformRbacModule`

File: `libs/platform/rbac/rbac.module.ts`

Provides:

- `RbacGuard`
- `RBAC_PERMISSIONS_PROVIDER` (defaults to `StaticRolePermissionsProvider`)
- `DbRoleHydrator` (used for DB-hydrated role evaluation)

### `RbacGuard`

File: `libs/platform/rbac/rbac.guard.ts`

Enforcement flow:

1. If `@Public()` is present → allow (skips auth + RBAC when the access-token guard is also present).
2. If `@SkipRbac()` is present → allow (skips RBAC only; rare).
3. Read required permissions from class + handler metadata (additive merge).
4. Read `req.principal` (set by `AccessTokenGuard`).
   - For `/v1/admin/*` endpoints (or when `@UseDbRoles()` is present), the guard refreshes the principal’s `roles` from the database first.
5. Resolve granted permissions via `PermissionsProvider`.
6. Require **all** declared permissions (AND semantics).
7. On failure: throw RFC7807 `FORBIDDEN`.

### Decorators

- `@RequirePermissions(...)` — file: `libs/platform/rbac/rbac.decorator.ts`
  - Can be applied at controller level and/or handler level.
  - Controller requirements apply to all handlers.
  - Handler requirements are **added** (ANDed) with controller requirements.
  - Multiple decorator usages are supported; duplicates are normalized away.
- `@SkipRbac()` — file: `libs/platform/rbac/skip-rbac.decorator.ts`
  - Escape hatch to bypass RBAC checks while still requiring authentication.
- `@Public()` — file: `libs/platform/auth/public.decorator.ts`
  - Escape hatch to bypass authentication and RBAC entirely.
- `@UseDbRoles()` — file: `libs/platform/rbac/use-db-roles.decorator.ts`
  - Opt-in to DB-hydrated role evaluation for a controller/handler (admin endpoints enforce this by default).

## Permission Strings

Permission format:

`<resource>:<action>`

Examples:

- `users:read`
- `users:write`
- `sessions:revoke`

Matching supports wildcards:

- `*:*` matches everything
- `users:*` matches any action on `users`
- `*:read` matches `read` on any resource

Implementation: `libs/platform/rbac/permissions.ts`

## How to Protect an Endpoint

For copy-paste examples, see `docs/guide/adding-an-endpoint.md`.

Checklist:

1. Import `PlatformAuthModule` and `PlatformRbacModule` in the module that declares the controller.
2. Apply guards in order: `@UseGuards(AccessTokenGuard, RbacGuard)`.
3. Declare permissions with `@RequirePermissions(...)`.
4. Add Swagger bearer auth and error codes:
   - `@ApiBearerAuth('access-token')`
   - `@ApiErrorCodes([UNAUTHORIZED, FORBIDDEN, ...])`

## Role → Permission Mapping

By default, RBAC uses a static mapping:

- Provider: `libs/platform/rbac/static-role-permissions.provider.ts`
- Token: `RBAC_PERMISSIONS_PROVIDER` (`libs/platform/rbac/rbac.tokens.ts`)

## Where Roles Come From (Recommended)

This kit treats roles as **auth data**:

- Persist a user’s role(s) in the database (e.g., `User.role` / `User.roles`).
- When minting an access token, embed those roles in the `roles: string[]` claim.
- `AccessTokenGuard` verifies the token and attaches `AuthPrincipal` (including `roles`) to `req.principal`.
- `RbacGuard` uses those roles to compute granted permissions and enforce `@RequirePermissions(...)`.

Keeping roles DB-backed avoids “configuration admin lists” that drift or become a security liability.

To customize:

- If you want static mapping: edit `ROLE_PERMISSIONS` in `StaticRolePermissionsProvider`.
- If you want DB-driven permissions later: implement `PermissionsProvider` and bind it to
  `RBAC_PERMISSIONS_PROVIDER` in your app/module wiring.

## Notes / Pitfalls

- `RbacGuard` expects `req.principal` to be present; always pair it with `AccessTokenGuard`.
- `@RequirePermissions(...)` does nothing unless `RbacGuard` runs.
- Prefer fine-grained permissions on handlers (least privilege) and keep names stable; refactors of permission strings are breaking authorization changes.
- Avoid giving `ADMIN` a `*:*` wildcard by default; it makes it too easy to over-grant as the system grows.
