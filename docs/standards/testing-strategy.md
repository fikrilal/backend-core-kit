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

## Integration Tests

Scope:

- repositories against real Postgres
- Redis primitives (rate limiter, idempotency storage, BullMQ enqueue semantics)

Baseline dependency strategy:

- Docker Compose (local + CI), or
- Testcontainers (preferred when available)

Rules:

- Tests must run from a clean DB state (migrate + reset + seed).

## End-to-End Tests

Scope:

- HTTP API flows via Supertest against a real Nest app instance.

Rules:

- Assert response envelope and problem-details shapes.
- Assert `X-Request-Id` behavior.

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
