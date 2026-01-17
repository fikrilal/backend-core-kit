# Admin Feature Code Quality Audit

Date: 2026-01-17  
Scope: `libs/features/admin/**`

## Executive Summary

Overall, the admin feature is in good shape: layering is respected, input validation and RBAC are explicit, and there’s real attention to production invariants (e.g., “last active admin” safety). The biggest improvement opportunity is tightening type/contract alignment and reducing repetitive controller boilerplate to keep the feature maintainable as it grows.

## Checks Run

All commands were run from repo root (`/mnt/c/Development/_CORE/backend-core-kit`).

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm test -- libs/features/admin` ✅
- `npm run deps:check` ✅
- OpenAPI gates:
  - `npm run openapi:lint` ✅
  - `npm run openapi:check` ❌ in this environment due to native module mismatch (`@node-rs/argon2` binding load failure)
  - Expected: `bash tools/agent/npmw run openapi:check` (Windows toolchain), but `powershell.exe` failed with a WSL vsock error in this run

## Strengths (Keep)

- Clear architecture boundaries:
  - App layer contains framework-free services and port definitions (`libs/features/admin/app/*`).
  - Infra layer is the only place with NestJS/Prisma dependencies (`libs/features/admin/infra/*`).
- Solid admin safety invariants:
  - Demotion/suspension of the last active admin is prevented inside a DB transaction using an advisory lock (`libs/features/admin/infra/persistence/prisma-admin-users.repository.ts`).
- API discipline is explicit:
  - RBAC + idempotency + documented error codes are present on admin endpoints (`libs/features/admin/infra/http/admin-users.controller.ts`).
- Good unit coverage exists for the audit repository’s list query mapping and keyset pagination (`libs/features/admin/infra/persistence/prisma-admin-audit.repository.spec.ts`).

## Findings & Recommendations

### P0 — Type/Contract Mismatch: “Set status” types allow `DELETED` but runtime does not

**Status**
- Fixed on 2026-01-17 by introducing `AdminUserMutableStatus` and using it for the “set status” command surface.

**Evidence**
- `AdminUserStatus` includes `DELETED` (`libs/features/admin/app/admin-users.types.ts`), and that type flows into:
  - `SetUserStatusInput.status` (`libs/features/admin/app/ports/admin-users.repository.ts`)
  - `SetAdminUserStatusRequestDto.status` (`libs/features/admin/infra/http/dtos/admin-user-status.dto.ts`)
- But the HTTP endpoint validation only allows `ACTIVE | SUSPENDED` via `ADMIN_USER_STATUS_VALUES` (`libs/features/admin/infra/http/dtos/admin-user-status.dto.ts`).
- Repository logic treats any non-`SUSPENDED` input as `ACTIVE` (`libs/features/admin/infra/persistence/prisma-admin-users.repository.ts`).

**Impact**
- Easy footgun: a future caller (or refactor) can pass `DELETED` through types and accidentally “reactivate” a user (because the code maps “not suspended” => active).
- Type definitions do not reflect the actual command surface area.

**Recommendation**
- Split the concepts:
  - `AdminUserStoredStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED'` (for read models)
  - `AdminUserMutableStatus = 'ACTIVE' | 'SUSPENDED'` (for commands + DTOs)
- Change `SetUserStatusInput.status` and `SetAdminUserStatusRequestDto.status` to `AdminUserMutableStatus`.
- Make the mapping explicit in the repository:
  - If input is not `'ACTIVE' | 'SUSPENDED'`, fail fast (should be unreachable after the type change).

---

### P1 — Mixed response envelope strategy across controllers

**Status**
- Fixed on 2026-01-17 by making admin controllers consistently return “raw” results and rely on `ResponseEnvelopeInterceptor` to produce `{ data, meta? }`.

**Evidence**
- Some endpoints manually return `{ data, meta }` (e.g., list users), while others return list-shaped objects and rely on `ResponseEnvelopeInterceptor` to wrap into `{ data, meta }` (e.g., audit list endpoints).
  - `libs/features/admin/infra/http/admin-users.controller.ts`
  - `libs/features/admin/infra/http/admin-audit.controller.ts`

**Impact**
- Increases cognitive load and makes it easier to introduce subtle contract mismatches (especially around pagination meta).

**Recommendation**
- Pick one approach for the feature:
  1) Prefer “thin controllers”: return app results and rely on `ResponseEnvelopeInterceptor` consistently, or
  2) Prefer explicit envelopes: always return `{ data, meta? }` from controllers and treat interceptor as a safety net (or use a `@SkipEnvelope()` pattern if you want the interceptor out of the way).

---

### P1 — Repetitive `AdminError` → `ProblemException` mapping boilerplate

**Status**
- Fixed on 2026-01-17 by introducing `AdminErrorFilter` and removing controller-local `try/catch` mapping.

**Evidence**
- Endpoints repeatedly `try/catch` and call `mapAdminError`, and re-derive titles from status codes (`libs/features/admin/infra/http/admin-users.controller.ts`).

**Impact**
- Harder to maintain when more endpoints get added; higher chance of inconsistencies (titles, codes, shape).

**Recommendation**
- Introduce an admin-scoped exception filter in infra (e.g., `AdminProblemFilter`) that catches `AdminError` and emits RFC7807 with `ProblemException`.
- Controllers then stay linear (no local `try/catch`).

---

### P2 — Response model ambiguity: `roles: string[]` vs `role`

**Evidence**
- App types: `roles: ReadonlyArray<string>` (`libs/features/admin/app/admin-users.types.ts`)
- Persistence mapping: always returns a single role array (`roles: [String(user.role)]`) (`libs/features/admin/infra/persistence/prisma-admin-users.repository.ts`)
- DTO: `roles!: string[]` (`libs/features/admin/infra/http/dtos/admin-users.dto.ts`)

**Impact**
- Ambiguous contract: suggests multi-role semantics while implementation appears single-role.

**Recommendation**
- Either:
  - Rename to `role: AdminUserRole` everywhere (simplest), or
  - If multi-role is intended soon, define `roles: AdminUserRole[]` and keep persistence mapping aligned.

---

### P2 — DTO duplication: `CursorPaginationMetaDto` repeated 3× in admin

**Evidence**
- `libs/features/admin/infra/http/dtos/admin-users.dto.ts`
- `libs/features/admin/infra/http/dtos/admin-user-role-change-audit.dto.ts`
- `libs/features/admin/infra/http/dtos/admin-user-account-deletion-audit.dto.ts`

**Impact**
- Duplicate code drifts easily; minor but persistent maintenance friction.

**Recommendation**
- Extract a shared `CursorPaginationMetaDto` under `libs/features/admin/infra/http/dtos/` and reuse it.

---

### P2 — Repository file size and repeated keyset pagination utilities

**Evidence**
- Large files with repeated patterns:
  - `libs/features/admin/infra/persistence/prisma-admin-users.repository.ts`
  - `libs/features/admin/infra/persistence/prisma-admin-audit.repository.ts`

**Impact**
- Harder to navigate and safely modify; increases review time and risk of regressions.

**Recommendation**
- Consider extracting shared “cursor where builder” helpers to `libs/shared/list-query` (only if used across multiple features), or keep feature-local helpers but split into smaller files (e.g., `admin-users.list-query.ts`, `admin-audit.list-query.ts`) for readability.

## Suggested Next Steps (Low-Risk Order)

1. ✅ Fix P0 type/contract mismatch for `setUserStatus` (separate mutable vs stored status).
2. ✅ Add an admin exception filter to remove controller boilerplate.
3. Extract `CursorPaginationMetaDto` to a shared DTO.
4. ✅ Standardize envelope strategy across admin controllers.
