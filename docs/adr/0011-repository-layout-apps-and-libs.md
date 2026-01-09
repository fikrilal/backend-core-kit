# ADR: Repository Layout — apps/ + libs/ (API and Worker)

- Status: Accepted
- Date: 2026-01-08
- Decision makers: Core kit maintainers

## Context

We need a default project skeleton that:

- supports a separate worker process (BullMQ) without duplicating code
- enforces boundaries between platform concerns and business features
- scales to many feature modules without turning into a “src/” junk drawer

## Decision

We standardize on this top-level layout:

```text
/
├─ apps/
│  ├─ api/        # NestJS HTTP application (Fastify)
│  └─ worker/     # BullMQ worker application (separate process)
├─ libs/
│  ├─ platform/   # cross-cutting platform modules (config, otel, http, auth, rbac, db, queue)
│  └─ features/   # vertical slices (domain/app/infra per feature)
└─ docs/
```

The repository remains a **single npm project** at the root (one `package.json`). Apps and libs are internal code, not separately published packages.

## Rationale

- Separates process-specific bootstraps (`apps/api`, `apps/worker`) from shared code (`libs/*`).
- Makes platform concerns explicit and reviewable.
- Makes vertical slice boundaries discoverable and repeatable.

## Consequences

- Some tooling needs to understand multiple entrypoints (API vs worker).
- Developers must learn the boundary rules (domain/app/infra) and follow them.

## Alternatives Considered

- Single `src/` with two entrypoints:
  - rejected for baseline (tends to devolve into unclear boundaries as projects grow)
- Multi-package monorepo with npm workspaces:
  - deferred (not needed for baseline; can be introduced later if a project truly needs it)

## Links / References

- `docs/core/project-architecture.md`
- `docs/adr/0007-bullmq-separate-worker.md`
