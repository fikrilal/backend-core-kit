# Admin Shared and Capability Split

Date: 2026-08-09  
Owner: Codex  
Status: completed  
Risk class: medium  
Related issue/PR: N/A

## Objective

Reorganize `libs/features/admin` into capability folders (`admin-users/`,
`admin-audit/`, `whoami/`) plus a `shared/` layer, move the module to the
feature root, and remove the `app/`/`infra/` trees. Mirrors the completed auth
and users structures. Behavior-preserving.

## Constraints

- Architecture constraints:
  - keep `libs/platform/*` independent from `libs/features/*`;
  - keep `libs/shared/*` framework-free;
  - feature-internal `shared/` may import platform adapters;
  - capability services stay plain framework-free classes with ports.
- Product/runtime constraints:
  - no endpoint path, operation ID, tag, schema, or error-code change;
  - no RBAC permission or role-hydration change (`@UseDbRoles()` /
    `@RequirePermissions()` preserved);
  - no Prisma query change.
- Out of scope:
  - docs updates and full verification (phase 2);
  - commits or pushes.

## Impact Areas

- API/OpenAPI: yes (controller/DTO ownership moves, contract preserved)
- DB/Prisma/migrations: no
- Auth/session/RBAC: yes (admin RBAC decorators preserved)
- Queue/jobs: no
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: no
- CI/release/harness: yes

## Acceptance Criteria

1. `admin.module.ts` lives at the feature root.
2. `shared/` holds `admin.errors.ts` (with `AdminErrorCode` re-export),
   `admin-error.filter.ts`, `admin.model.ts`, `ports/`, and `persistence/`.
3. `admin-users/`, `admin-audit/`, `whoami/` hold their controllers, services,
   and consolidated DTO files.
4. `AdminAuditService` pass-through is kept (decision 2).
5. The `admin.error-codes.ts` re-export shim is removed.
6. `app/` and `infra/` trees are deleted.
7. Endpoint paths, operation IDs, tags, schemas, error codes unchanged.
8. typecheck, lint, format, deps:check, and admin specs pass.

## Implementation Checklist

- [ ] Move `admin.module.ts` from `infra/` to the feature root.
- [ ] Create `shared/admin.errors.ts` (fold in `AdminErrorCode` re-export).
- [ ] Move `admin-error.filter.ts` to `shared/`.
- [ ] Create `shared/admin.model.ts` (merge `admin-users.types.ts` +
      `admin-audit.types.ts`).
- [ ] Move ports to `shared/ports/`.
- [ ] Move persistence (repos, query-builders, mappers, spec) to
      `shared/persistence/`.
- [ ] Create `admin-users/` (controller, service, `admin-users.dto.ts`).
- [ ] Create `admin-audit/` (controller, service, `admin-audit.dto.ts`).
- [ ] Create `whoami/` (controller, `whoami.dto.ts`).
- [ ] Consolidate the 6 DTO files into 3 capability DTO files.
- [ ] Update `admin.module.ts` wiring and all importers.
- [ ] Delete `app/` and `infra/` trees.
- [ ] Run targeted verification.

## Decision Log

- 2026-08-09: Keep `AdminAuditService` pass-through -> symmetric with
  `AdminUsersService`; controller stays thin.
- 2026-08-09: Keep one shared `AdminErrorFilter` -> matches auth/users.
- 2026-08-09: Consolidate DTOs per capability -> one DTO file per capability,
  matching auth/users.

## Verification

```bash
npm run typecheck
npm run deps:check
npm run format:check
npm run lint
npm test -- --runTestsByPath libs/features/admin/infra/persistence/prisma-admin-audit.repository.spec.ts
NODE_ENV=development npm run openapi:generate
NODE_ENV=development npm run openapi:check
npm run openapi:lint
```

## Runtime Evidence

Not required; this phase changes file locations and import paths only. RBAC
behavior is covered by the auth-admin e2e in phase 2.

## Risks And Mitigations

- Risk: RBAC decorators drift during the move.
  - Mitigation: preserve decorators verbatim; auth-admin e2e in phase 2.
- Risk: DTO consolidation changes OpenAPI schema.
  - Mitigation: merge preserves all decorators; OpenAPI generate/check/lint.

## Completion Notes

Phase 1 implemented and verified:

- `admin.module.ts` moved to the feature root; `apps/api/src/app.module.ts` and
  `test/admin-last-admin.int-spec.ts` importers updated.
- `shared/` built: `admin.errors.ts` (hosts the `AdminErrorCode` re-export),
  `admin-error.filter.ts`, `admin.model.ts` (merged admin-users + admin-audit
  types), `ports/`, `persistence/` (repos, query-builders, mappers, spec).
- Capability folders created:
  - `admin-users/` (controller, service, consolidated `admin-users.dto.ts` —
    merged the users list + role + status DTOs);
  - `admin-audit/` (controller, service, consolidated `admin-audit.dto.ts` —
    merged the two audit DTOs);
  - `whoami/` (controller, `whoami.dto.ts`).
- `AdminAuditService` pass-through kept (decision 2); shared `AdminErrorFilter`
  kept (decision 3); DTOs consolidated per capability (decision 4).
- `app.error-codes.ts` re-export shim removed.
- `app/` and `infra/` trees deleted.
- Simplified the unreachable `never` exhaustiveness guard in
  `prisma-admin-users.repository.ts` (default now throws directly).

Verification outcomes:

- `npm run typecheck`: passed (0 errors).
- `npm run deps:check`: passed (280 modules, 738 deps, no violations).
- `npm run format:check`: passed.
- `npm run lint`: passed.
- Admin audit repository spec (3 tests): passed.
- Auth e2e (4 suites, 53 tests): passed, incl. auth-admin (list, role change,
  status change, whoami, audits) proving RBAC intact.
- `npm test`: 263 passed, 5 pre-existing platform env failures (unchanged).
- OpenAPI check + lint: passed (snapshot unchanged).

## Follow-Ups

- [ ] Phase 2: docs + verification.
