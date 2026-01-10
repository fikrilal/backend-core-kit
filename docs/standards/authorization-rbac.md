# Authorization (RBAC) Standard

This core kit standardizes authorization using **RBAC** (Role-Based Access Control). Multi-tenancy is a future roadmap item and is intentionally not required at baseline.

## Goals

- A consistent authorization model across projects.
- Enforcement that is easy to audit (guards/decorators, not scattered `if`s).
- A foundation that can evolve to ABAC/multi-tenant later without rewriting everything.

## Model

### Roles

Roles are coarse-grained groupings like:

- `USER`
- `ADMIN`

Projects may extend roles, but should keep the set small.

### Roles in Access Tokens (Baseline)

In this core kit, roles are carried in the **first-party access token** as a claim:

- `roles: string[]` (example: `["USER"]`)

Baseline behavior:

- Every authenticated principal is issued a default `["USER"]` role.
- Unknown roles grant **no** permissions (deny by default).

### Permissions (Capabilities)

Permissions are fine-grained capabilities expressed as strings:

`<resource>:<action>`

Examples:

- `users:read`
- `users:write`
- `wallets:transfer`
- `admin:*`

Rules:

- Avoid embedding business-specific context into permission strings; keep them durable.
- Prefer additive permissions over “magic admin bypasses”.

## Enforcement Pattern

Use declarative enforcement in the HTTP layer:

- Decorator: `@RequirePermissions('users:read')`
- Guard: checks the authenticated principal for required permissions

Rules:

- Services may perform secondary checks for ownership or contextual constraints (e.g., “user can update own profile”), but role/capability requirements should remain visible at the route boundary.
- Apply the access-token guard before RBAC (authenticate first, then authorize).

## Permission Taxonomy (Route Boundary)

Baseline recommendation:

- Use **fine-grained** permissions on handlers (least privilege), e.g. `users:read`, `sessions:revoke`.
- Optionally add a controller-level baseline gate like `admin:access` for `/v1/admin/*` controllers, and keep handler requirements additive.

Avoid:

- using `*:*` as a long-term “admin bypass” (too easy to over-grant)
- inventing new permission strings ad-hoc without a clear resource/action convention

## Where Roles Live

Baseline approaches:

1. **DB-backed role assignment + code-defined mapping** (recommended default)

- Role assignment is stored on the user record (e.g. `User.role = USER | ADMIN`).
- The role set is static/enumerated; role → permissions mapping is code-defined.
- Simple, fast, consistent.

2. **DB-driven roles** (optional extension)

- Roles/permissions stored in tables.
- Useful for admin consoles and dynamic policy updates, but adds complexity.

The core kit should make approach (1) easy and leave room to adopt (2) when a project actually needs it.

## Roadmap: Multi-Tenancy

When introduced, tenant scoping should be:

- a first-class claim in auth context (e.g., `tenantId`)
- enforced by guards + repository scoping
- audited in logs/traces
