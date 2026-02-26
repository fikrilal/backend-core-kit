# Architecture Smell Scan Report

Generated: 2026-02-26T02:51:11.603Z
Mode: CI
Baseline: tools/architecture-smells.baseline.json (found)

## Summary

- High: 6
- Medium: 30
- Low: 12
- Total: 48
- New vs baseline: 0

## High

### boundary_app_imports_platform_impl (2)

- libs/features/users/app/user-profile-image.service.ts:2
  - Feature app layer imports platform path "../../../platform/storage/object-storage.service"
  - Snippet: `import type { ObjectStorageService } from '../../../platform/storage/object-storage.service';`
  - Docs: `docs/standards/code-quality.md`
- libs/features/users/app/user-profile-image.service.ts:3
  - Feature app layer imports platform path "../../../platform/storage/object-storage.types"
  - Snippet: `import type { PresignedPutObject } from '../../../platform/storage/object-storage.types';`
  - Docs: `docs/standards/code-quality.md`

### duplicate_tx_retry_classifier (4)

- apps/worker/src/jobs/users-account-deletion.worker.ts:411
  - Duplicate retryable transaction classifier found; use shared utility
  - Snippet: `function isRetryableTransactionError(err: unknown): boolean {`
  - Docs: `docs/standards/reliability.md`
- libs/features/admin/infra/persistence/prisma-admin-users.repository.ts:488
  - Duplicate retryable transaction classifier found; use shared utility
  - Snippet: `function isRetryableTransactionError(err: unknown): boolean {`
  - Docs: `docs/standards/reliability.md`
- libs/features/auth/infra/persistence/prisma-auth.repository.tx.ts:3
  - Duplicate retryable transaction classifier found; use shared utility
  - Snippet: `export function isRetryableTransactionError(err: unknown): boolean {`
  - Docs: `docs/standards/reliability.md`
- libs/features/users/infra/persistence/prisma-users.repository.ts:290
  - Duplicate retryable transaction classifier found; use shared utility
  - Snippet: `function isRetryableTransactionError(err: unknown): boolean {`
  - Docs: `docs/standards/reliability.md`

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
- libs/features/admin/infra/persistence/prisma-admin-users.repository.ts:46
  - Repeated cursor where-builder helper detected
  - Snippet: `function equalsForCursor(`
  - Docs: `docs/standards/code-quality.md`
- libs/features/admin/infra/persistence/prisma-admin-users.repository.ts:68
  - Repeated cursor where-builder helper detected
  - Snippet: `function compareForCursor(`
  - Docs: `docs/standards/code-quality.md`
- libs/features/admin/infra/persistence/prisma-admin-users.repository.ts:92
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
- apps/worker/src/jobs/users-account-deletion.worker.ts:1
  - File has 415 LOC (threshold 350)
  - Snippet: `import { Injectable, type OnModuleInit } from '@nestjs/common';`
  - Docs: `docs/standards/code-quality.md`
- libs/features/admin/infra/persistence/prisma-admin-audit.repository.ts:1
  - File has 527 LOC (threshold 350)
  - Snippet: `import { Injectable } from '@nestjs/common';`
  - Docs: `docs/standards/code-quality.md`
- libs/features/admin/infra/persistence/prisma-admin-users.repository.ts:1
  - File has 510 LOC (threshold 350)
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

- libs/features/auth/infra/http/auth.controller.ts:105
  - Repeated best-effort job enqueue/schedule/cancel logging block
  - Snippet: `'Failed to enqueue verification email job',`
  - Docs: `docs/guide/adding-a-job.md`
- libs/features/auth/infra/http/auth.controller.ts:274
  - Repeated best-effort job enqueue/schedule/cancel logging block
  - Snippet: `'Failed to enqueue password reset email job',`
  - Docs: `docs/guide/adding-a-job.md`
- libs/features/users/infra/http/profile-image.controller.ts:99
  - Repeated best-effort job enqueue/schedule/cancel logging block
  - Snippet: `'Failed to schedule profile image upload expiry job',`
  - Docs: `docs/guide/adding-a-job.md`
- libs/features/users/infra/http/profile-image.controller.ts:143
  - Repeated best-effort job enqueue/schedule/cancel logging block
  - Snippet: `'Failed to enqueue profile image cleanup job',`
  - Docs: `docs/guide/adding-a-job.md`
- libs/features/users/infra/http/profile-image.controller.ts:176
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

### repeated_request_trace_fallback (8)

- libs/features/admin/infra/http/admin-users.controller.ts:107
  - Repeated request trace fallback `req.requestId ?? "unknown"`
  - Snippet: `traceId: req.requestId ?? 'unknown',`
  - Docs: `docs/standards/observability.md`
- libs/features/admin/infra/http/admin-users.controller.ts:144
  - Repeated request trace fallback `req.requestId ?? "unknown"`
  - Snippet: `traceId: req.requestId ?? 'unknown',`
  - Docs: `docs/standards/observability.md`
- libs/features/users/infra/http/profile-image.controller.ts:91
  - Repeated request trace fallback `req.requestId ?? "unknown"`
  - Snippet: `traceId: req.requestId ?? 'unknown',`
  - Docs: `docs/standards/observability.md`
- libs/features/users/infra/http/profile-image.controller.ts:134
  - Repeated request trace fallback `req.requestId ?? "unknown"`
  - Snippet: `traceId: req.requestId ?? 'unknown',`
  - Docs: `docs/standards/observability.md`
- libs/features/users/infra/http/profile-image.controller.ts:167
  - Repeated request trace fallback `req.requestId ?? "unknown"`
  - Snippet: `traceId: req.requestId ?? 'unknown',`
  - Docs: `docs/standards/observability.md`
- libs/features/users/infra/http/profile-image.controller.ts:205
  - Repeated request trace fallback `req.requestId ?? "unknown"`
  - Snippet: `traceId: req.requestId ?? 'unknown',`
  - Docs: `docs/standards/observability.md`
- libs/features/users/infra/http/user-account-deletion.controller.ts:56
  - Repeated request trace fallback `req.requestId ?? "unknown"`
  - Snippet: `traceId: req.requestId ?? 'unknown',`
  - Docs: `docs/standards/observability.md`
- libs/features/users/infra/http/user-account-deletion.controller.ts:101
  - Repeated request trace fallback `req.requestId ?? "unknown"`
  - Snippet: `traceId: req.requestId ?? 'unknown',`
  - Docs: `docs/standards/observability.md`

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
