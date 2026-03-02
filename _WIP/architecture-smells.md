# Architecture Smell Scan Report

Generated: 2026-03-02T06:58:45.893Z
Mode: Local
Baseline: tools/architecture-smells.baseline.json (found)

## Summary

- High: 0
- Medium: 0
- Low: 11
- Total: 11

## Low

### repeated_local_string_normalizer (11)

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
- libs/platform/http/idempotency/idempotency.core.ts:38
  - Repeated local `asNonEmptyString` helper; consider shared utility
  - Snippet: `export function asNonEmptyString(value: unknown): string | undefined {`
  - Docs: `docs/standards/code-quality.md`
- libs/platform/http/idempotency/idempotency.interceptor.ts:12
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
