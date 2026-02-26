# Architecture Smell Scan Report

Generated: 2026-02-26T14:58:51.985Z
Mode: CI
Baseline: tools/architecture-smells.baseline.json (found)

## Summary

- High: 0
- Medium: 22
- Low: 12
- Total: 34
- New vs baseline: 10

## Medium

### duplicate_cursor_where_builder (8)

- libs/features/admin/infra/persistence/prisma-admin-audit.repository.ts:62
  - Repeated cursor where-builder helper detected
  - Snippet: `function equalsForCursor(`
  - Docs: `docs/standards/code-quality.md`
- libs/features/admin/infra/persistence/prisma-admin-audit.repository.ts:98
  - Repeated cursor where-builder helper detected
  - Snippet: `function compareForCursor(`
  - Docs: `docs/standards/code-quality.md`
- libs/features/admin/infra/persistence/prisma-admin-audit.repository.ts:138
  - Repeated cursor where-builder helper detected
  - Snippet: `function buildAfterCursorWhere(`
  - Docs: `docs/standards/code-quality.md`
- libs/features/admin/infra/persistence/prisma-admin-audit.repository.ts:171
  - Repeated cursor where-builder helper detected
  - Snippet: `function buildAfterAccountDeletionCursorWhere(`
  - Docs: `docs/standards/code-quality.md`
- libs/features/admin/infra/persistence/prisma-admin-users.repository.ts:47 [new]
  - Repeated cursor where-builder helper detected
  - Snippet: `function equalsForCursor(`
  - Docs: `docs/standards/code-quality.md`
- libs/features/admin/infra/persistence/prisma-admin-users.repository.ts:69 [new]
  - Repeated cursor where-builder helper detected
  - Snippet: `function compareForCursor(`
  - Docs: `docs/standards/code-quality.md`
- libs/features/admin/infra/persistence/prisma-admin-users.repository.ts:93 [new]
  - Repeated cursor where-builder helper detected
  - Snippet: `function buildAfterCursorWhere(`
  - Docs: `docs/standards/code-quality.md`
- libs/features/auth/infra/persistence/prisma-auth.repository.sessions.ts:67
  - Repeated cursor where-builder helper detected
  - Snippet: `function buildAfterSessionCursorWhere(`
  - Docs: `docs/standards/code-quality.md`

### oversized_orchestration_file (6)

- apps/worker/src/jobs/emails.worker.ts:1
  - File has 398 LOC (threshold 350)
  - Snippet: `import { Injectable, type OnModuleInit } from '@nestjs/common';`
  - Docs: `docs/standards/code-quality.md`
- apps/worker/src/jobs/users-account-deletion.worker.ts:1 [new]
  - File has 400 LOC (threshold 350)
  - Snippet: `import { Injectable, type OnModuleInit } from '@nestjs/common';`
  - Docs: `docs/standards/code-quality.md`
- libs/features/admin/infra/persistence/prisma-admin-audit.repository.ts:1
  - File has 527 LOC (threshold 350)
  - Snippet: `import { Injectable } from '@nestjs/common';`
  - Docs: `docs/standards/code-quality.md`
- libs/features/admin/infra/persistence/prisma-admin-users.repository.ts:1 [new]
  - File has 466 LOC (threshold 350)
  - Snippet: `import { Injectable } from '@nestjs/common';`
  - Docs: `docs/standards/code-quality.md`
- libs/features/auth/app/auth.service.ts:1
  - File has 653 LOC (threshold 350)
  - Snippet: `import { normalizeEmail } from '../domain/email';`
  - Docs: `docs/standards/code-quality.md`
- libs/platform/http/idempotency/idempotency.service.ts:1
  - File has 428 LOC (threshold 350)
  - Snippet: `import { createHash } from 'crypto';`
  - Docs: `docs/standards/code-quality.md`

### repeated_best_effort_job_try_catch (8)

- libs/features/auth/infra/http/auth.controller.ts:92 [new]
  - Repeated best-effort job enqueue/schedule/cancel logging block
  - Snippet: `'Failed to enqueue verification email job',`
  - Docs: `docs/guide/adding-a-job.md`
- libs/features/auth/infra/http/auth.controller.ts:267 [new]
  - Repeated best-effort job enqueue/schedule/cancel logging block
  - Snippet: `'Failed to enqueue password reset email job',`
  - Docs: `docs/guide/adding-a-job.md`
- libs/features/users/infra/http/profile-image.controller.ts:104 [new]
  - Repeated best-effort job enqueue/schedule/cancel logging block
  - Snippet: `'Failed to schedule profile image upload expiry job',`
  - Docs: `docs/guide/adding-a-job.md`
- libs/features/users/infra/http/profile-image.controller.ts:148 [new]
  - Repeated best-effort job enqueue/schedule/cancel logging block
  - Snippet: `'Failed to enqueue profile image cleanup job',`
  - Docs: `docs/guide/adding-a-job.md`
- libs/features/users/infra/http/profile-image.controller.ts:181 [new]
  - Repeated best-effort job enqueue/schedule/cancel logging block
  - Snippet: `'Failed to enqueue profile image cleanup job',`
  - Docs: `docs/guide/adding-a-job.md`
- libs/features/users/infra/http/user-account-deletion.controller.ts:66
  - Repeated best-effort job enqueue/schedule/cancel logging block
  - Snippet: `'Failed to enqueue account deletion requested email job',`
  - Docs: `docs/guide/adding-a-job.md`
- libs/features/users/infra/http/user-account-deletion.controller.ts:76
  - Repeated best-effort job enqueue/schedule/cancel logging block
  - Snippet: `'Failed to schedule account deletion reminder email job',`
  - Docs: `docs/guide/adding-a-job.md`
- libs/features/users/infra/http/user-account-deletion.controller.ts:110
  - Repeated best-effort job enqueue/schedule/cancel logging block
  - Snippet: `'Failed to cancel account deletion reminder email job',`
  - Docs: `docs/guide/adding-a-job.md`

## Low

### repeated_local_string_normalizer (12)

- apps/worker/src/jobs/emails.worker.ts:87
  - Repeated local `asNonEmptyString` helper; consider shared utility
  - Snippet: `function asNonEmptyString(value: unknown): string | undefined {`
  - Docs: `docs/standards/code-quality.md`
- libs/features/auth/infra/jobs/auth-password-reset.jobs.ts:11
  - Repeated local `asNonEmptyString` helper; consider shared utility
  - Snippet: `function asNonEmptyString(value: unknown): string | undefined {`
  - Docs: `docs/standards/code-quality.md`
- libs/features/auth/infra/rate-limit/rate-limit.utils.ts:10
  - Repeated local `asNonEmptyString` helper; consider shared utility
  - Snippet: `export function asNonEmptyString(value: unknown): string | undefined {`
  - Docs: `docs/standards/code-quality.md`
- libs/features/auth/infra/security/crypto-access-token-issuer.ts:14
  - Repeated local `asNonEmptyString` helper; consider shared utility
  - Snippet: `function asNonEmptyString(value: unknown): string | undefined {`
  - Docs: `docs/standards/code-quality.md`
- libs/platform/auth/auth.utils.ts:5
  - Repeated local `asNonEmptyString` helper; consider shared utility
  - Snippet: `export function asNonEmptyString(value: unknown): string | undefined {`
  - Docs: `docs/standards/code-quality.md`
- libs/platform/config/env.runtime.ts:3
  - Repeated local `asNonEmptyString` helper; consider shared utility
  - Snippet: `function asNonEmptyString(value: unknown): string | undefined {`
  - Docs: `docs/standards/code-quality.md`
- libs/platform/email/email.service.ts:6
  - Repeated local `asNonEmptyString` helper; consider shared utility
  - Snippet: `function asNonEmptyString(value: unknown): string | undefined {`
  - Docs: `docs/standards/code-quality.md`
- libs/platform/http/idempotency/idempotency.interceptor.ts:12
  - Repeated local `asNonEmptyString` helper; consider shared utility
  - Snippet: `function asNonEmptyString(value: unknown): string | undefined {`
  - Docs: `docs/standards/code-quality.md`
- libs/platform/http/idempotency/idempotency.service.ts:67
  - Repeated local `asNonEmptyString` helper; consider shared utility
  - Snippet: `function asNonEmptyString(value: unknown): string | undefined {`
  - Docs: `docs/standards/code-quality.md`
- libs/platform/http/request-id.ts:6
  - Repeated local `asNonEmptyString` helper; consider shared utility
  - Snippet: `function asNonEmptyString(value: unknown): string | undefined {`
  - Docs: `docs/standards/code-quality.md`
- libs/platform/push/fcm-push.service.ts:19
  - Repeated local `asNonEmptyString` helper; consider shared utility
  - Snippet: `function asNonEmptyString(value: unknown): string | undefined {`
  - Docs: `docs/standards/code-quality.md`
- libs/platform/storage/object-storage.service.ts:19
  - Repeated local `asNonEmptyString` helper; consider shared utility
  - Snippet: `function asNonEmptyString(value: unknown): string | undefined {`
  - Docs: `docs/standards/code-quality.md`
