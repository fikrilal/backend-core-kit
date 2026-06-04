# Duplication Report (core)

Generated: 2026-06-04T14:10:08.644Z
Raw report: .tmp/jscpd-core/jscpd-report.json
Allowlist: tools/duplication-allowlist.json

## Summary

- Raw duplicates: 29
- Self-file filtered out: 15
- Cross-file duplicates: 14
- Categorized duplicates: 11
- Uncategorized filtered out: 3
- Reviewed acceptable groups: 0
- Actionable duplicate groups: 6
- Unused allowlist entries: 0

## Actionable Category Breakdown

- Cursor/filter/sort helper: 1
- Date/time parsing or normalization helper: 1
- DTO/view mapper: 1
- Prisma query builder: 1
- Queue job envelope/idempotency helper: 1
- Rate limiter helper: 1

## Actionable Groups

- [Cursor/filter/sort helper] libs/features/admin/infra/http/dtos/cursor-pagination-meta.dto.ts:4 <> libs/features/auth/infra/http/dtos/me-sessions.dto.ts:74
  occurrences=1, maxLines=15, maxTokens=0
- [Date/time parsing or normalization helper] libs/features/auth/app/auth-push-tokens.service.ts:6 <> libs/features/auth/app/auth-sessions.service.ts:43
  occurrences=1, maxLines=14, maxTokens=0
- [DTO/view mapper] libs/features/admin/infra/http/dtos/admin-user-account-deletion-audit.dto.ts:12 <> libs/features/admin/infra/http/dtos/admin-user-role-change-audit.dto.ts:7
  occurrences=1, maxLines=18, maxTokens=0
- [Prisma query builder] libs/features/admin/infra/persistence/prisma-admin-audit.query-builders.ts:88 <> libs/features/admin/infra/persistence/prisma-admin-users.query-builders.ts:52
  occurrences=4, maxLines=21, maxTokens=0
- [Queue job envelope/idempotency helper] libs/platform/queue/queue.producer.ts:20 <> libs/platform/queue/queue.worker.ts:22
  occurrences=2, maxLines=15, maxTokens=0
- [Rate limiter helper] libs/features/auth/infra/rate-limit/redis-email-verification-rate-limiter.ts:57 <> libs/features/auth/infra/rate-limit/redis-password-reset-rate-limiter.ts:61
  occurrences=2, maxLines=26, maxTokens=0

## Interpretation

Actionable means the duplicate matched a backend category and has not been reviewed as acceptable.
It does not automatically mean extract immediately; it means review the pattern before adding more parallel code.
Reviewed acceptable duplicates must stay explicit in the allowlist with rationale.
