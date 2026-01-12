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

- `cp env.example .env`
- `npm run deps:up` (Postgres + Redis via Docker Compose)
- `npm install`
- `npm run prisma:migrate && npm run prisma:generate`
- `npm run start:dev` (API on `http://127.0.0.1:4000`, Swagger UI at `/docs` in dev)
- `npm run start:worker:dev` (worker on `http://127.0.0.1:4001`)
- `npm run verify` (format/lint/typecheck/boundaries/tests/openapi gates)

## Pointers

- Docs index: `docs/README.md`
- Engineering notes (integration contracts): `docs/engineering/README.md`
