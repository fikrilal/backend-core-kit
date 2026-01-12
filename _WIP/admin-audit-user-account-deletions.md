# Engineering Proposal: Admin Audit Log — Account Deletion Events

## Goal

Add a read-only admin endpoint to query **account deletion audit events** recorded in `UserAccountDeletionAudit`.

This is needed for:

- support/debug (“who requested deletion?”, “was it canceled?”, “did it finalize?”)
- compliance (“what happened to this account and when?”)
- observability correlation via `traceId` (maps to `X-Request-Id`)

## Non-goals

- No PII in this endpoint (no email, no profile fields).
- No joins that could accidentally reintroduce PII (keep it **ID-only**).
- No write APIs (admin-triggered deletion, cancel-on-behalf, etc.).

## API

### `GET /v1/admin/audit/user-account-deletions`

- Auth: `Authorization: Bearer <accessToken>`
- Guards:
  - `AccessTokenGuard`
  - `RbacGuard`
  - `@UseDbRoles()` (DB-hydrated roles for all `/v1/admin/*`)
- Permissions:
  - Controller baseline: `admin:access`
  - Handler: `audit:user-account-deletions:read`

#### Success response

HTTP `200` with envelope `{ data, meta }`:

- `data`: `UserAccountDeletionAudit[]`
- `meta`: cursor pagination meta (`limit`, `hasMore`, optional `nextCursor`)

Item shape (IDs only):

- `id: uuid`
- `actorUserId: uuid`
- `actorSessionId: uuid`
- `targetUserId: uuid`
- `action: 'REQUESTED' | 'CANCELED' | 'FINALIZED' | 'FINALIZE_BLOCKED_LAST_ADMIN'`
- `traceId: string` (equals `X-Request-Id` from the request/job that produced the audit row)
- `createdAt: ISO datetime`

#### Errors

- `400 VALIDATION_FAILED` (invalid query params)
- `401 UNAUTHORIZED`
- `403 FORBIDDEN` (no permission)
- `500 INTERNAL`

## Query semantics (ListQuery)

Follow the same patterns as `GET /v1/admin/audit/user-role-changes`.

### Pagination

- Cursor pagination (`cursor` param) + `limit` (default 25)
- Sort default: `createdAt desc`
- Tie-break: `id desc`

### Sort

Allowed:

- `createdAt` (datetime)
- `id` (uuid)

### Filters

Allowed:

- `filter[actorUserId][eq]=<uuid>`
- `filter[targetUserId][eq]=<uuid>`
- `filter[action][eq]=REQUESTED|CANCELED|FINALIZED|FINALIZE_BLOCKED_LAST_ADMIN`
- `filter[action][in]=REQUESTED&filter[action][in]=CANCELED&...`
- `filter[traceId][eq]=<string>`
- `filter[createdAt][gte]=<iso>` / `filter[createdAt][lte]=<iso>`

Notes:

- `traceId` filter is the “fast path” for support because it links directly to logs/traces.
- We intentionally do **not** support fuzzy search (email is scrubbed post-finalization).

## Implementation plan (repo-aligned)

### 1) Types (feature/app)

Add types in `libs/features/admin/app/admin-audit.types.ts`:

- `AdminUserAccountDeletionAuditsSortField = 'createdAt' | 'id'`
- `AdminUserAccountDeletionAuditsFilterField = 'actorUserId' | 'actorSessionId'? | 'targetUserId' | 'action' | 'createdAt' | 'traceId'`
- `AdminUserAccountDeletionAuditListItem` + `AdminUserAccountDeletionAuditListResult`

Extend `AdminAuditRepository` with:

- `listUserAccountDeletionAudits(query): Promise<...>`

Extend `AdminAuditService` with:

- `listUserAccountDeletionAudits(query)`

### 2) Persistence (feature/infra)

Extend `PrismaAdminAuditRepository` with `listUserAccountDeletionAudits`:

- Map list-query filters to `Prisma.UserAccountDeletionAuditWhereInput`.
- Apply cursor where clause using `createdAt` + `id` (same algorithm as role changes).
- `select` only ID fields + `traceId` + `createdAt`.

Schema/index note:

- Current indexes (`targetUserId, createdAt`, `actorUserId, createdAt`, `traceId`) are sufficient for v1.
- Optional later improvement: `@@index([createdAt, id])` if this becomes a heavy query.

### 3) HTTP controller + DTOs

Add `GET user-account-deletions` under `AdminAuditController`:

- `@RequirePermissions('audit:user-account-deletions:read')`
- `@ApiListQuery(...)` with the exact allowed sort/filter rules above.

Add DTO file:

- `libs/features/admin/infra/http/dtos/admin-user-account-deletion-audit.dto.ts`
  - `AdminUserAccountDeletionAuditDto`
  - `AdminUserAccountDeletionAuditsListEnvelopeDto`

### 4) RBAC wiring

Update `StaticRolePermissionsProvider`:

- Add `audit:user-account-deletions:read` to `ADMIN`.

### 5) Tests

Add an e2e test:

- Create admin user
- Create normal user and request deletion + cancel (or request only)
- As admin, call `GET /v1/admin/audit/user-account-deletions?filter[targetUserId][eq]=...`
- Assert at least one row exists, fields match, and `action` is correct.

### 6) Contract gates

- Run `openapi:generate` → commit snapshot
- Ensure `openapi:lint` passes

## Security + privacy notes

- The endpoint is intentionally “ID-only”; any PII must be obtained via separate admin user lookup endpoints with explicit access controls.
- `traceId` is safe to expose and is critical for incident response.
