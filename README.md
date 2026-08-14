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
- Repository-local loop engineering for scoped agent tasks, isolated worktrees,
  risk-aware verification, bounded repair, verified handoff, and independent CI

## Agent development loop

`backendkit` is the canonical harness used internally by the current Codex
conversation. It does not launch another agent. Start with a human-approved V2
execution plan, let the current agent use the task/workspace/verification
commands, then separately authorize publication actions after review.

```bash
npm run backendkit -- doctor
npm run backendkit -- task begin --plan docs/exec-plans/active/<plan>.md
npm run backendkit -- task verify --task <task-id>
```

See `docs/engineering/loop-engineering.md` for the architecture and readiness
status, and `docs/engineering/agent-pr-loop.md` for the operating workflow.

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
- `npm run backendkit -- doctor` (read-only harness prerequisite inspection)
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

- Follow `docs/guide/personalizing-a-project.md` and create `docs/core/project-profile.md`
- Update `package.json` name/description/versioning as needed
- Set `OTEL_SERVICE_NAME` (and `OTEL_EXPORTER_OTLP_ENDPOINT` in staging/prod)
- Review `docs/README.md` + `docs/standards/README.md` for the non-negotiables
- Keep `env.example` in sync; never commit `.env`
