# Architecture Smell Scan Report

Generated: 2026-06-04T14:17:21.314Z
Mode: Local
Baseline: tools/architecture-smells.baseline.json (not found)

## Summary

- High: 0
- Medium: 7
- Low: 0
- Total: 7

## Medium

### worker_wall_clock_usage (7)

- apps/worker/src/jobs/emails.handlers.ts:33
  - Worker/job code uses wall-clock time; review whether Clock injection or explicit now parameter is needed
  - Snippet: `const now = new Date();`
  - Docs: `docs/standards/code-quality.md`
- apps/worker/src/jobs/emails.handlers.ts:110
  - Worker/job code uses wall-clock time; review whether Clock injection or explicit now parameter is needed
  - Snippet: `const now = new Date();`
  - Docs: `docs/standards/code-quality.md`
- apps/worker/src/jobs/emails.handlers.ts:237
  - Worker/job code uses wall-clock time; review whether Clock injection or explicit now parameter is needed
  - Snippet: `const now = new Date();`
  - Docs: `docs/standards/code-quality.md`
- apps/worker/src/jobs/push.worker.ts:62
  - Worker/job code uses wall-clock time; review whether Clock injection or explicit now parameter is needed
  - Snippet: `const now = new Date();`
  - Docs: `docs/standards/code-quality.md`
- apps/worker/src/jobs/users-account-deletion.worker.ts:80
  - Worker/job code uses wall-clock time; review whether Clock injection or explicit now parameter is needed
  - Snippet: `const now = new Date();`
  - Docs: `docs/standards/code-quality.md`
- apps/worker/src/jobs/users-account-deletion.worker.ts:126
  - Worker/job code uses wall-clock time; review whether Clock injection or explicit now parameter is needed
  - Snippet: `const now = new Date();`
  - Docs: `docs/standards/code-quality.md`
- apps/worker/src/jobs/users-account-deletion.worker.ts:133
  - Worker/job code uses wall-clock time; review whether Clock injection or explicit now parameter is needed
  - Snippet: `const now = new Date();`
  - Docs: `docs/standards/code-quality.md`
