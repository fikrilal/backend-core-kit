# Project Architecture

This core kit is designed as a **modular monolith** with hard boundaries and a separate worker process for background jobs.

## Architectural Principles

- **Vertical slice / feature-first**: features own their product behavior,
  persistence adapters, HTTP surface, jobs, and feature-specific rules.
- **Progressive feature architecture**: start with the smallest feature shape
  that fits the current behavior, then promote to stricter layers only when the
  feature needs them. See `docs/adr/0018-progressive-feature-architecture.md`.
- **Clean boundaries when present**:
  - `domain`: pure business rules (no Nest, no Prisma, no Redis, no HTTP)
  - `app`: use-cases (orchestration), ports (interfaces), policies
  - `infra`: adapters (db, http, queue, external services)
- **One bootstrap per process**:
  - API bootstrap wires config, logging, tracing, DI, and routes.
  - Worker bootstrap wires config, logging, tracing, DI, and job processors.
- **Transport is not domain**: response envelopes, problem details, and request IDs live in the platform layer.
  - The `app` layer may still define **use-case response models** (often named `*View`) that are shaped for the external API contract.
  - It is acceptable for `*View` models to use JSON-friendly types (e.g., ISO timestamp strings) as long as `app` stays framework-agnostic (no Nest/Swagger imports).
  - Keep the `domain` layer pure and free of transport concerns; convert domain records → `*View` in `app` when it reduces duplication.

## Repository Layout (Standard)

This layout is standardized by ADR: `docs/adr/0011-repository-layout-apps-and-libs.md`.

```text
/
├─ docs/
├─ tools/backendkit/               # repository-local task/verification loop; never imported by apps/libs
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
│     └─ <feature-name>/        # progressive feature slice
│        ├─ *.module.ts         # simple endpoint/capability slices may live here
│        ├─ <capability>/       # grouped endpoint/capability code when useful
│        └─ domain/app/infra    # only when the feature needs clean boundaries
└─ package.json
```

The exact internal file names can evolve, but the top-level `apps/` + `libs/`
structure and the dependency direction are requirements of this core kit.

## Feature Tiers

Use the smallest tier that fits the current behavior.

| Tier                  | Use when                                                                                                      | Typical shape                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Endpoint slice        | Simple CRUD, settings, read/list endpoints, one repository, no complex invariant                              | controller, DTO, service, repository, optional errors, colocated tests                              |
| Capability slice      | Multiple related endpoints share behavior, policies, or persistence                                           | capability folders with controller/service/repository/policy/types and optional feature-shared code |
| Clean/hexagonal slice | Auth, money, deletion, queues, transaction-heavy invariants, multiple adapters, framework-free use-case tests | explicit `domain`, `app`, `ports`, and `infra` boundaries                                           |

Promote to a clean/hexagonal slice when one of these is true:

- business rules must be pure and independently unit-tested;
- one use case needs multiple adapters;
- external side effects must be orchestrated through ports;
- transaction boundaries span multiple repositories or aggregates;
- queue retries, idempotency, or eventual consistency affect correctness;
- auth/session/RBAC/security-sensitive behavior is changing;
- the feature is expected to be extracted or reused outside the Nest HTTP
  process;
- repository behavior is complex enough that framework-free app tests materially
  improve confidence.

## Dependency Direction (Rule)

```text
platform must not depend on features
features must not depend on apps
shared must stay framework-free
domain, when present, stays pure
app, when present, stays framework-free and must not import infra
```

Examples:

- `domain` must not import `@nestjs/*`, `@prisma/client`, Redis, BullMQ, or HTTP types.
- `app`, when used, defines use cases and interfaces (“ports”) that adapters implement.
- Simple endpoint slices may use Nest `@Injectable` in feature services.
- Repository classes remain the persistence boundary; do not put Prisma queries in controllers.

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
- Exposes `/health` and `/ready` (typically on `WORKER_PORT`) for orchestration.

## Cross-Cutting Platform Concerns

Platform-level behaviors are implemented once and reused everywhere:

- request ID and correlation
- response envelope
- problem-details error mapping (RFC 7807 shape)
- auth token issuance and verification
- RBAC enforcement primitives
- observability (OpenTelemetry, logging)
