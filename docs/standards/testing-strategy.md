# Testing Strategy (Pyramid + Contract Gates)

This core kit uses a testing pyramid:

1. Unit tests (fast)
2. Integration tests (real dependencies)
3. End-to-end tests (full API flows)
4. Contract gates (OpenAPI snapshot + lint)

## Unit Tests

Scope:

- domain rules (pure)
- use-cases (app layer) with faked ports

Rules:

- No DB, no Redis, no HTTP.
- Deterministic and fast.

Command:

- `npm test`

## Integration Tests

Scope:

- repositories against real Postgres
- Redis primitives (rate limiter, idempotency storage, BullMQ enqueue semantics)
  - including worker job processing / queue semantics when needed

Baseline dependency strategy:

- Docker Compose (local + CI), or
- Testcontainers (preferred when available)

Core kit baseline:

- CI smoke tests enqueue `system.smoke` (happy path; touches Postgres) and `system.smokeRetry` (intentional failure → retry with backoff → success). Enqueue happens via the real API app DI (`QueueProducer`) to keep the golden path honest without adding a public endpoint.

Rules:

- Tests must be isolated and reproducible:
  - prefer a clean DB state (migrate + reset + seed), or
  - use an isolated schema/database per run to avoid cross-test pollution.

Conventions:

- Files: `test/**/*.int-spec.ts`
- Command: `npm run test:int`
- Optional escape hatch: set `SKIP_DEPS_TESTS=true` to intentionally skip deps-required integration suites.

## End-to-End Tests

Scope:

- HTTP API flows via Supertest against a real Nest app instance.

Rules:

- Assert response envelope and problem-details shapes.
- Assert `X-Request-Id` behavior.

Conventions:

- Files: `test/**/*.e2e-spec.ts`
- Command: `npm run test:e2e`
- Optional escape hatch: set `SKIP_DEPS_TESTS=true` to intentionally skip deps-required e2e suites.

## Local Golden Path (Deps + Tests)

To run the full deps-backed suite locally (Docker Compose + migrations + integration + e2e) use:

- `npm run verify:e2e`

## Contract Gates (CI)

Two non-negotiable CI gates:

1. **OpenAPI snapshot**

- Generate OpenAPI from code.
- Compare to committed artifact (`docs/openapi/openapi.yaml`).
- Fail CI if uncommitted changes exist.

2. **Spectral lint**

- Lint the OpenAPI artifact for governance rules:
  - envelope schemas
  - problem-details schema usage
  - `x-error-codes` presence
  - run using `.spectral.yaml`

## What Not To Do

- Do not rely on “manual testing only”.
- Do not mock everything; integration tests must exist for persistence and critical infrastructure.
