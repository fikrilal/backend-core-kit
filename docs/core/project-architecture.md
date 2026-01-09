# Project Architecture

This core kit is designed as a **modular monolith** with hard boundaries and a separate worker process for background jobs.

## Architectural Principles

- **Vertical slice / feature-first**: features own their domain, application logic, and infrastructure adapters.
- **Clean boundaries**:
  - `domain`: pure business rules (no Nest, no Prisma, no Redis, no HTTP)
  - `app`: use-cases (orchestration), ports (interfaces), policies
  - `infra`: adapters (db, http, queue, external services)
- **One bootstrap per process**:
  - API bootstrap wires config, logging, tracing, DI, and routes.
  - Worker bootstrap wires config, logging, tracing, DI, and job processors.
- **Transport is not domain**: response envelopes, problem details, and request IDs live in the platform layer.

## Repository Layout (Standard)

This layout is standardized by ADR: `docs/adr/0011-repository-layout-apps-and-libs.md`.

```text
/
├─ docs/
├─ apps/
│  ├─ api/                      # HTTP API (NestJS + Fastify)
│  │  └─ src/
│  │     ├─ main.ts             # API bootstrap
│  │     ├─ app.module.ts       # API module wiring
│  │     └─ ...                 # platform + features imported here
│  └─ worker/                   # background jobs (BullMQ workers)
│     └─ src/
│        ├─ main.ts             # worker bootstrap
│        ├─ worker.module.ts    # worker wiring
│        └─ ...
├─ libs/
│  ├─ platform/                 # cross-cutting concerns
│  │  ├─ config/
│  │  ├─ logging/
│  │  ├─ observability/         # OpenTelemetry setup
│  │  ├─ http/                  # interceptors/filters/request-id/idempotency
│  │  ├─ auth/                  # token issuance, jwks, guards
│  │  ├─ rbac/                  # roles/policies/guards
│  │  ├─ db/                    # Prisma client, transaction helpers
│  │  └─ queue/                 # BullMQ abstraction + wiring
│  └─ features/
│     └─ <feature-name>/
│        ├─ domain/             # pure domain model + invariants
│        ├─ app/                # use-cases + ports
│        └─ infra/              # adapters (prisma repos, queue jobs, http controllers)
└─ package.json
```

The exact internal file names can evolve, but the top-level `apps/` + `libs/` structure and the dependency direction are requirements of this core kit.

## Dependency Direction (Rule)

```text
infra  -> app  -> domain
platform -> (infra/app), but domain must not depend on platform
```

Examples:

- `domain` must not import `@nestjs/*`, `@prisma/client`, Redis, BullMQ, or HTTP types.
- `app` defines interfaces (“ports”) that infra implements.
- `infra` contains Prisma repositories, HTTP controllers, BullMQ processors, external API clients.

## Process Model

Two processes are the baseline:

1. **API process**

- Serves HTTP traffic.
- Emits traces/metrics/logs with request correlation.
- Enqueues background jobs to BullMQ.

2. **Worker process**

- Consumes BullMQ jobs.
- Runs retries/backoff/dead-letter policies.
- Emits traces/metrics/logs with job correlation.

## Cross-Cutting Platform Concerns

Platform-level behaviors are implemented once and reused everywhere:

- request ID and correlation
- response envelope
- problem-details error mapping (RFC 7807 shape)
- auth token issuance and verification
- RBAC enforcement primitives
- observability (OpenTelemetry, logging)
