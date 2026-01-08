# Project Overview

Backend Core Kit is a **production-ready backend boilerplate** with opinionated defaults. It is intended to be a long-lived foundation for many future services, not a toy starter.

## Goals

- Ship new backends faster without re-learning baseline production concerns every project.
- Standardize non-business behavior across services:
  - config + secrets handling
  - API envelope + error shape
  - auth (OIDC-primary + password) issuing first-party access+refresh tokens
  - RBAC authorization patterns
  - Postgres + migrations + transaction patterns
  - Redis + BullMQ background jobs (separate worker process)
  - observability via OpenTelemetry + structured logs
  - health/readiness endpoints and graceful shutdown
- Keep architectural boundaries clear so projects remain maintainable as they scale.

## Non-Goals

- Building a fully modular microservices platform (this is a modular monolith baseline).
- Solving every domain problem (payments, billing, complex multi-tenancy) out of the box.
- Supporting cloud-managed queues (BullMQ + Redis is the default and the only supported queue in this kit).

## Intended Use

Use this core kit as the starting point for:
- consumer apps backends (mobile/web)
- internal APIs
- service backends with background jobs

Projects should extend the kit by adding **features** (vertical slices) rather than changing platform foundations.

## Golden Path (Baseline Capabilities)

1) API server (NestJS + Fastify)
- Versioned routes (e.g., `/v1/*`) and consistent response envelope.
- Generated OpenAPI from code, checked in CI.

2) Auth + Authorization
- OIDC is the primary login method; password auth is also first-class.
- Both methods mint the same first-party access+refresh tokens.
- RBAC enforcement via guards/decorators.

3) Data + Background Work
- Postgres + Prisma with migrations.
- Redis for cache/locks and BullMQ for background jobs.
- Worker runs as a separate process by default.

4) Observability + Reliability
- Structured JSON logs with request correlation and PII-redaction guidance.
- OpenTelemetry traces + metrics exported to Grafana Cloud (OTLP).
- Timeouts, graceful shutdown, idempotency guidelines, and health/readiness endpoints.

