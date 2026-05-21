# Backend Runtime Evidence

Runtime evidence proves behavior that static checks cannot fully prove.

Use this guide when a backend change touches real services, network effects,
queues, migrations, auth/session behavior, observability, or deployment/runtime
settings.

## When Evidence Is Expected

Attach runtime evidence for medium/high-risk changes in these areas:

- auth/session/token/RBAC behavior
- queue or worker behavior
- idempotency or rate-limit behavior
- Prisma migrations, repository behavior, or request flows touching Postgres
- Redis-backed state
- MinIO/S3/profile-image storage behavior
- email or push integration behavior
- observability, logging, tracing, metrics, or request correlation
- startup, readiness, health, or shutdown behavior
- CI/release/deployment changes

Docs-only and narrow unit-test-only changes usually do not need runtime evidence.

## Evidence Types

### Full Dependency-Backed Gate

Use when the change touches database, Redis, queues, storage, or critical API
flows.

```bash
npm run verify:e2e
```

Record:

- command
- exit code
- relevant failure output if it failed
- whether Docker dependencies were stopped cleanly

### Targeted Integration Or E2E Command

Use when the full gate is too broad and the changed behavior maps to a narrower
suite.

```bash
npm run test:int -- --runInBand
npm run test:e2e -- --runInBand
```

For targeted Jest patterns, include the exact pattern.

```bash
npm run test:e2e -- auth-core
```

Record:

- suite/pattern
- relevant environment variables, with secrets redacted
- pass/fail outcome

### HTTP Transcript

Use when a changed endpoint needs concrete request/response proof.

Acceptable tools:

- `curl`
- `httpie`
- Supertest output from an e2e test

Record:

- method and path
- status code
- response envelope or problem-details shape
- `X-Request-Id` / `traceId` correlation
- redacted body snippets

Never include access tokens, refresh tokens, private keys, service-account JSON,
or raw PII.

### Queue/Worker Evidence

Use when a change touches BullMQ job contracts, producers, processors, retries,
backoff, idempotency, or worker shutdown.

Record:

- queue name
- job name
- job ID
- state transition
- retry/backoff evidence when relevant
- structured log lines with job/request IDs

Prefer test-backed evidence for worker behavior. Logs alone are not enough for
logic changes.

### Migration Evidence

Use when Prisma schema or migrations changed.

Record:

```bash
npm run verify:prisma
npm run prisma:migrate:status
npm run prisma:migrate:deploy
```

For local DB-backed validation, `npm run verify:e2e` is usually the cleanest
evidence because it starts dependencies, applies migrations, runs integration
and e2e tests, and stops dependencies.

### Observability Evidence

Use when changes affect logs, traces, metrics, request IDs, readiness, or error
reporting.

Record:

- sample structured log line
- request ID and trace ID linkage
- metric/trace name when applicable
- health/readiness output for startup/readiness changes

Do not include secrets or raw PII in logs.

### API Contract Evidence

Use when HTTP routes, DTOs, decorators, envelope behavior, or error codes
changed.

Record:

```bash
npm run openapi:generate
npm run openapi:check
npm run openapi:lint
```

Include:

- OpenAPI diff summary
- changed operation IDs
- changed response schemas
- added/changed `x-error-codes`

## Minimum Evidence By Risk Class

### Low

Usually enough:

- exact static checks and outcomes
- no runtime evidence unless behavior changed

### Medium

Expected:

- targeted test or full `npm run verify:e2e` when real dependencies are touched
- API contract evidence when HTTP surface changed
- log/trace or queue evidence when behavior is runtime-sensitive

### High

Expected:

- full relevant gate, usually `npm run verify:e2e`
- targeted tests for changed critical behavior
- concrete runtime artifact or transcript
- explicit rollback evidence or rollback plan
- human review

## Evidence Hygiene

Never include:

- secrets
- JWTs
- refresh tokens
- private keys
- service-account JSON
- raw passwords
- raw PII
- production database URLs or Redis URLs

Redact values but keep structure:

```text
Authorization: Bearer <redacted>
refreshToken: <redacted>
email: user-<redacted>@example.com
```

## PR Template Mapping

Use `.github/pull_request_template.md`:

- `Runtime Evidence` for transcripts, logs, traces, queue state, and artifact paths
- `Verification` for exact commands and outcomes
- `Risk / Rollback` for likely failure modes and rollback strategy
- `Reviewer Focus` for decisions that need human attention

## Related Docs

- `docs/engineering/agent-pr-loop.md`
- `docs/engineering/guardrails.md`
- `docs/standards/testing-strategy.md`
- `docs/standards/observability.md`
- `docs/standards/security.md`
