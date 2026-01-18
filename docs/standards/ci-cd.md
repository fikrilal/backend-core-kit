# CI/CD Golden Path

This document defines the baseline CI/CD workflow expected for projects using this core kit.

## Pull Request Gates (Required)

On every PR:

1. Quality gates

- lint
- format check
- typecheck
- dependency boundary check (architecture rules + cycle detection)

2. Test gates

- unit tests
- integration tests (real Postgres/Redis via Docker Compose or Testcontainers)
- e2e tests for critical flows (as the project grows)

3. Contract gates (non-negotiable)

- generate OpenAPI from code and compare with committed snapshot (`docs/openapi/openapi.yaml`)
- run Spectral lint on the OpenAPI artifact using `.spectral.yaml`

Meta gate (recommended):

- prove the gates are effective (OpenAPI drift and boundary violations are caught): `npm run verify:gates`

4. Security gates (baseline)

- secret scanning (pre-merge)
- dependency scanning (best-effort)

Reference implementation:

- GitHub Actions workflow: `.github/workflows/ci.yml`

## Build + Release (Baseline)

On main branch merges:

- Build a production Docker image (immutable, tagged by commit SHA).
- Publish artifacts to the registry.
- Record `service.version` for observability (logs/traces).

## Migrations (Production Safety)

Guideline:

- Run DB migrations as an explicit, gated step (e.g., `prisma migrate deploy`) before or during deploy.
- Prefer “expand/contract” migrations for zero-downtime changes.

## Deploy (Baseline)

Deployment should:

- use environment-provided configuration and secrets
- roll out safely (blue/green or rolling with health/readiness checks)
- verify readiness before shifting traffic

## Changelog / Tagging

Baseline expectations (can be automated later):

- release tags
- changelog entries for contract changes
- documented migration steps when schema changes
