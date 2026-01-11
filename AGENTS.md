# Repository Guidelines

This file is the **AI/Contributor implementation guide** for this repository. It is intentionally opinionated: the entire point of this core kit is consistency across many future projects.

If you are changing behavior, standards, or architecture, update docs + add an ADR first (or in the same PR).

## Source of Truth (Read First)

- Index: `docs/README.md`
- Architecture: `docs/core/project-architecture.md`
- Stack decisions: `docs/core/project-stack.md`
- Standards (normative): `docs/standards/README.md`
- Decision log (ADRs): `docs/adr/README.md`
- OpenAPI contract: `docs/openapi/README.md`

## Non-Negotiables (Hard Rules)

- **TypeScript strict** and **no `any`** (`any`, `as any`, implicit `any` are forbidden). Use `unknown` + validation/narrowing.
- **Architecture boundaries are enforced** (dependency-cruiser): do not “just import” across layers.
- **API contract discipline**:
  - success envelope `{ data, meta? }`
  - errors are RFC7807 (`application/problem+json`) with stable `code` and `traceId`
  - OpenAPI snapshot is committed and linted (Spectral) on every API change
- **Two-process baseline**: API and BullMQ worker are separate processes by default.
- No secrets in git; secrets injected at runtime (env/secret manager/mounted files).

See ADRs: `docs/adr/0013-typescript-strict-no-any.md`, `docs/adr/0014-enforce-architecture-boundaries.md`.

## Architecture Overview (Implementer Notes)

### Repository Layout (Standard)

```text
apps/api/        # NestJS HTTP app bootstrap
apps/worker/     # BullMQ worker bootstrap
libs/platform/   # config/logging/otel/http/auth/rbac/db/queue (reusable)
libs/features/   # vertical slices (domain/app/infra per feature)
docs/            # specs + ADRs (source of truth)
```

ADR: `docs/adr/0011-repository-layout-apps-and-libs.md`.

### Layering Rules (Strict)

Within a feature:

- `domain`: pure rules (no Nest/Prisma/Redis/BullMQ/HTTP imports)
- `app`: use-cases + ports (interfaces). Must not import infra or framework details.
- `infra`: adapters (Prisma repos, BullMQ processors, controllers). May import `app` + `domain` + `platform`.

Dependency direction:

```text
infra  -> app  -> domain
```

Platform rule:

- `libs/platform/*` must not depend on `libs/features/*`.

## API Standards (Transport Layer)

- Success: `{ data, meta? }` (`docs/standards/api-response-standard.md`).
- Errors: RFC7807 with:
  - `code` (stable; see `docs/standards/error-codes.md`)
  - `traceId` equal to `X-Request-Id`
  - optional `errors[]` for validation details
- Pagination/filter/sort: `docs/standards/pagination-filtering-sorting.md`

## Auth Standards (Baseline Decisions)

- OIDC is primary login method; password auth is also first-class.
- Both mint **first-party** session tokens.
- Access tokens:
  - asymmetrically signed (EdDSA/Ed25519 recommended; RS256 optional)
  - include `kid`
  - publish public keys at `/.well-known/jwks.json`
- Refresh tokens:
  - **opaque** secrets
  - rotated on every refresh
  - reuse detection revokes the whole session

See:

- `docs/standards/authentication.md`
- ADRs: `docs/adr/0005-auth-oidc-primary-first-party-tokens.md`, `docs/adr/0006-jwt-asymmetric-jwks-rotation.md`, `docs/adr/0010-refresh-tokens-opaque-rotation.md`

## Background Jobs (BullMQ)

- BullMQ + Redis is the only supported queue in this kit.
- Worker runs in `apps/worker` (separate process).
- Jobs must be idempotent; bounded retries with backoff; observable (logs/traces/metrics).

See: `docs/standards/queues-jobs.md` and ADR `docs/adr/0007-bullmq-separate-worker.md`.

## Observability (Enterprise Baseline)

- JSON structured logs (PII-minimized; never log secrets).
- Request correlation via `X-Request-Id` and `traceId`.
- OpenTelemetry traces + metrics exported via OTLP to Grafana Cloud.
- Health endpoints: `/health` (liveness) and `/ready` (readiness).

See: `docs/standards/observability.md`, `docs/standards/security.md`, ADR `docs/adr/0008-opentelemetry-grafana-cloud.md`.

## OpenAPI Contract Gates

- Generated OpenAPI snapshot is committed at `docs/openapi/openapi.yaml`.
- Spectral ruleset lives in `.spectral.yaml` (enforces `operationId`, tags, and `x-error-codes` at minimum).
- Any API change must update the snapshot and keep Spectral passing.

See: `docs/openapi/README.md` and ADR `docs/adr/0012-openapi-artifact-and-spectral-ruleset.md`.

## Tooling & Commands (Expected Scripts)

Projects built from this kit should provide stable scripts (names may be finalized during scaffolding):

- `npm run start:dev` (API)
- `npm run start:worker` (worker)
- `npm run lint` / `npm run format` / `npm run typecheck`
- `npm run deps:check` (boundary rules + cycle detection)
- `npm test` / `npm run test:e2e`
- `npm run openapi:generate` / `npm run openapi:lint`

## When to Add an ADR

Add an ADR for:

- changing any baseline decision (framework, auth/token strategy, envelope/error shape)
- altering folder layout/boundary rules
- changing contract gates (OpenAPI location, Spectral rules)
- adopting a new major infrastructure dependency (db/queue/otel/logging)

Use `docs/adr/template.md` and keep ADRs short and specific.

## Agent-Specific Implementation Workflow

Before coding:

1. Read `docs/README.md` and the relevant standards.
2. Confirm the change fits the architecture; if not, propose/write an ADR.
3. Implement minimally; when adding/changing reusable platform/core infra, update the relevant docs/guides/standards; update OpenAPI snapshot if API changes.
4. Ensure boundary rules aren’t violated (no “shortcut imports”).

### Local Validation Checklist (Agent + Contributor)

Before handing off changes, run the same gates CI enforces (`.github/workflows/ci.yml`):

- `npm run verify`

When applicable:

- If you changed HTTP routes/controllers/DTOs/OpenAPI decorators: run `npm run openapi:generate`, then re-run `npm run openapi:check`.
- If you changed Prisma schema/migrations or request flows touching Postgres/Redis: run `npm run verify:e2e` (always stops local deps).

WSL note (agent-only): run these via `bash tools/agent/npmw ...` (and `bash tools/agent/dockw ...` for Docker) to avoid OS-specific artifacts.

### Windows Toolchain Interop (Agent-Only)

This repo commonly lives on a Windows filesystem mount (`/mnt/c/...`). To avoid OS-specific artifacts (notably `node_modules` and Prisma engines), treat **Windows** as the source of truth for installs/builds/tests when running from WSL.

- Preflight: run `bash tools/agent/doctor` (fails fast with actionable errors).
- Run Windows commands from WSL via: `bash tools/agent/win <command> [...args]` (examples: `npm`, `docker`, `node`).
- Convenience wrappers:
  - `bash tools/agent/npmw ...`
  - `bash tools/agent/dockw ...`
  - `bash tools/agent/gitw ...`
- Do not run `npm install/ci` in WSL for this repo.
- Prefer `.env` for configuration; WSL environment variables do not reliably propagate into Windows processes.

Documentation hygiene:

- When you need **up-to-date** third-party library documentation (NestJS, Prisma, BullMQ, etc.), **use Context7 first** (`resolve-library-id` → `query-docs`).
- Do not rely on memory or ad-hoc web searching unless Context7 has no coverage for the library/topic; if you fall back, say so explicitly.

If you must handle unknown input, use `unknown` + validation and keep domain pure.
