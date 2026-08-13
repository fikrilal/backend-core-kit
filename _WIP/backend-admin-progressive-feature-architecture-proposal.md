# Backend Admin Progressive Feature Architecture Proposal

- Status: Proposed for planning
- Date: 2026-08-09
- Scope: reorganizing `libs/features/admin` from the clean-architecture shape (`app/` + `infra/`) into capability folders + a shared layer, matching the completed auth and users structures
- Non-scope: changing runtime behavior, public API contracts, RBAC semantics, or Prisma queries

## Summary

The auth and users features were reorganized into capability folders with a
`shared/` layer, and that structure is now the proven default. The admin feature
still uses the pre-refactor clean-architecture shape: `app/` (services, ports,
types, errors) + `infra/` (http, persistence) + `infra/admin.module.ts`.

This proposal reorganizes `libs/features/admin` to match: capability folders
(`admin-users/`, `admin-audit/`, `whoami/`) plus a `shared/` layer, with the
module at the feature root. It is a behavior-preserving file reorganization.

## Current Context

Current structure (25 files, ~2,177 lines):

```text
libs/features/admin/
  app/
    admin-users.service.ts        # listUsers, setUserRole, setUserStatus (real error mapping)
    admin-audit.service.ts        # pure pass-through (2 delegate methods)
    admin-users.types.ts
    admin-audit.types.ts
    admin.errors.ts
    admin.error-codes.ts          # re-export shim
    ports/
      admin-users.repository.ts
      admin-audit.repository.ts
  infra/
    admin.module.ts
    http/
      admin-users.controller.ts   # list/setRole/setStatus
      admin-audit.controller.ts   # 2 audit lists
      whoami.controller.ts        # controller-only (no service)
      admin-error.filter.ts
      dtos/                       # 6 DTO files
    persistence/
      prisma-admin-users.repository.ts (+ query-builders)
      prisma-admin-audit.repository.ts (+ query-builders, spec)
      prisma-admin.mappers.ts
```

Three endpoint groups:

- `admin-users/` — list users, set role, set status
- `admin-audit/` — role-change + account-deletion audit lists
- `whoami/` — current principal (no service; hits the RBAC guard directly)

## Goals

- Match the auth/users capability-oriented structure.
- Remove the `admin.error-codes.ts` re-export shim and the `app/`/`infra/` trees.
- Keep behavior, endpoints, OpenAPI contracts, RBAC semantics, and Prisma queries identical.
- Keep the framework-free services testable via their ports.
- Update docs that reference the old admin structure.

## Non-goals

- No runtime behavior changes.
- No public API contract changes.
- No RBAC permission changes or role-hydration changes.
- No Prisma schema or migration changes.
- No change to the `@UseDbRoles()` / `@RequirePermissions()` admin wiring.

## Proposed Architecture

```text
libs/features/admin/
  admin.module.ts              # moved from infra/, wiring unchanged

  shared/
    admin.errors.ts            # AdminError + AdminErrorCode re-export
    admin-error.filter.ts      # moved from infra/http/
    admin.model.ts             # merged admin-users.types.ts + admin-audit.types.ts
    ports/
      admin-users.repository.ts
      admin-audit.repository.ts
    persistence/
      prisma-admin-users.repository.ts
      prisma-admin-users.query-builders.ts
      prisma-admin-audit.repository.ts
      prisma-admin-audit.query-builders.ts
      prisma-admin.mappers.ts

  admin-users/
    admin-users.controller.ts
    admin-users.dto.ts         # merged dtos (users list, role, status)
    admin-users.service.ts     # AdminUsersService (keeps error mapping)

  admin-audit/
    admin-audit.controller.ts
    admin-audit.dto.ts         # merged audit DTOs
    admin-audit.service.ts     # kept as-is, or controller -> repo port (see decision)

  whoami/
    whoami.controller.ts
    whoami.dto.ts
```

## Decisions To Confirm

1. **Split into 3 capability folders** (`admin-users/`, `admin-audit/`, `whoami/`)
   - `shared/` — mirrors auth/users. Default to this.

2. **`AdminAuditService` pass-through**: it is 2 methods that just delegate to
   the repo port. Options:
   - keep it (port-indirection value, consistent with `AdminUsersService`), or
   - delete it and have the controller call the repo port directly (like
     `whoami`, which has no service).
     Recommendation: keep it for symmetry with `AdminUsersService` and because
     the controller stays thin; it costs one small file.

3. **`AdminErrorFilter`**: keep one shared filter for the feature (like auth's
   `AuthErrorFilter` and users' `UsersErrorFilter`).

4. **DTO consolidation**: merge the 6 DTO files into 3 capability DTO files
   (`admin-users.dto.ts`, `admin-audit.dto.ts`, `whoami.dto.ts`) — matching the
   auth/users pattern of one DTO file per capability.

## Invariants

- `libs/platform/*` must not import `libs/features/*`.
- `libs/shared/*` stays framework-free.
- `shared/` (feature-internal) may import platform adapters.
- Capability services stay plain framework-free classes; controllers/DTOs stay thin.
- Endpoint paths, operation IDs, tags, schemas, error codes, and RBAC metadata
  are unchanged.
- OpenAPI snapshot must be regenerated/checked/linted after controller/DTO moves.

## Rollout

1. Move `admin.module.ts` to the feature root; rewire imports.
2. Create `shared/` (errors, filter, model, ports, persistence).
3. Create `admin-users/`, `admin-audit/`, `whoami/` capability folders.
4. Merge DTO files per capability.
5. Delete `app/` and `infra/` trees.
6. Regenerate OpenAPI, run targeted tests (admin specs + auth e2e), update docs.

## Risks And Tradeoffs

| Risk                                           | Impact                | Mitigation                                                    |
| ---------------------------------------------- | --------------------- | ------------------------------------------------------------- |
| RBAC metadata drift (permissions/hydration)    | Admin authz breaks    | Preserve decorators; run auth-admin e2e                       |
| DTO merge changes OpenAPI schema               | Client breakage       | Merge preserves all decorators; OpenAPI generate/check/lint   |
| Deleting the audit pass-through changes wiring | 404/409 mapping drift | Keep mapping in service or move to controller; targeted specs |
| Docs reference the old structure               | Stale guidance        | Update docs in the same change                                |

## Acceptance Criteria

- `app/` and `infra/` trees are gone; capability folders + `shared/` exist.
- No re-export shims remain (`admin.error-codes.ts`).
- Endpoint paths, operation IDs, tags, schemas, error codes unchanged.
- OpenAPI snapshot unchanged (or ordering-only).
- typecheck, lint, format, deps:check, admin specs, and auth e2e pass.
