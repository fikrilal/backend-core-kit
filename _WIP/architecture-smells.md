# Architecture Smell Scan Report

Generated: 2026-02-27T13:58:18.916Z
Mode: CI
Baseline: tools/architecture-smells.baseline.json (found)

## Summary

- High: 0
- Medium: 10
- Low: 12
- Total: 22
- New vs baseline: 5

## Medium

### duplicate_cursor_where_builder (4)

- libs/features/admin/infra/persistence/prisma-admin-audit.repository.ts:62
  - Repeated cursor where-builder helper detected
  - Snippet: `function equalsForCursor(`
  - Docs: `docs/standards/code-quality.md`
- libs/features/admin/infra/persistence/prisma-admin-audit.repository.ts:98
  - Repeated cursor where-builder helper detected
  - Snippet: `function compareForCursor(`
  - Docs: `docs/standards/code-quality.md`
- libs/features/admin/infra/persistence/prisma-admin-users.repository.ts:47 [new]
  - Repeated cursor where-builder helper detected
  - Snippet: `function equalsForCursor(`
  - Docs: `docs/standards/code-quality.md`
- libs/features/admin/infra/persistence/prisma-admin-users.repository.ts:69 [new]
  - Repeated cursor where-builder helper detected
  - Snippet: `function compareForCursor(`
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
- libs/features/admin/infra/persistence/prisma-admin-audit.repository.ts:1 [new]
  - File has 479 LOC (threshold 350)
  - Snippet: `import { Injectable } from '@nestjs/common';`
  - Docs: `docs/standards/code-quality.md`
- libs/features/admin/infra/persistence/prisma-admin-users.repository.ts:1 [new]
  - File has 443 LOC (threshold 350)
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
