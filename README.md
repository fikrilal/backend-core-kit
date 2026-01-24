# Backend Core Kit

Production-ready backend boilerplate with opinionated defaults (NestJS + Fastify, Postgres/Prisma, Redis/BullMQ, OpenTelemetry, OpenAPI contract gates).

Documentation is in `docs/README.md` (source of truth).

## What you get

- Two-process baseline: API (`apps/api`) + worker (`apps/worker`)
- API contract discipline:
  - success envelope `{ data, meta? }`
  - errors are RFC7807 (`application/problem+json`) with stable `code` + `traceId`
  - generated OpenAPI snapshot committed at `docs/openapi/openapi.yaml` and linted by Spectral
- Auth + sessions (password + OIDC), RBAC, idempotency keys, email infra, admin control-plane + audits

## Quickstart (local)

- Prereqs:
  - Node `>=22 <23`
  - Docker (for local deps and e2e)
- `cp env.example .env`
- `npm run deps:up` (Postgres + Redis via Docker Compose)
- `npm install`
- `npm run prisma:migrate && npm run prisma:generate`
- `npm run start:dev` (API on `http://127.0.0.1:4000`, Swagger UI at `/docs` in dev)
- `npm run start:worker:dev` (worker on `http://127.0.0.1:4001`)
- `npm run verify` (format/lint/typecheck/boundaries/tests/openapi gates)
- Optional: `npm run verify:e2e` (brings up local deps and runs e2e)

### WSL note (repo on Windows mount)

If this repo lives on a Windows filesystem mount (e.g. `/mnt/c/...`), prefer running commands via the wrappers:

- `bash tools/agent/npmw ...` (runs npm on Windows to avoid OS-specific artifacts)
- `bash tools/agent/dockw ...`

Avoid running `npm install/ci` in WSL for this repo.

## Pointers

- Docs index: `docs/README.md`
- Engineering notes (integration contracts): `docs/engineering/README.md`

## Using this as a template

Checklist:

- Update `package.json` name/description/versioning as needed
- Set `OTEL_SERVICE_NAME` (and `OTEL_EXPORTER_OTLP_ENDPOINT` in staging/prod)
- Review `docs/README.md` + `docs/standards/README.md` for the non-negotiables
- Keep `env.example` in sync; never commit `.env`
