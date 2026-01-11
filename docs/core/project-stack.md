# Project Stack

This stack is selected for long-term support, strong ecosystem maturity, and enterprise operability.

## Runtime + Language

- Node.js: **22 LTS**
- Package manager: **npm**
- Language: **TypeScript** (**strict mode**; `any` forbidden)

## HTTP Framework

- **NestJS** (DI, testing ergonomics, modularity)
- **Fastify** adapter (performance + good plugin ecosystem)

## API Contract

- OpenAPI: **code-first** generation via `@nestjs/swagger`
- CI contract gates:
  - OpenAPI snapshot verification (generated spec must match committed artifact)
  - Spectral lint (consistency + governance rules)

## Validation

- DTO validation: `class-validator` + `class-transformer`
- Global validation behavior: whitelist + forbid unknown fields + transform enabled

## Authentication / Tokens

- OIDC: “bring your own IdP” is primary
- Password auth: supported and first-class
- Session tokens: **first-party** access + refresh tokens for both login methods
- JWT signing: **asymmetric**, with key rotation (`kid`) and a **JWKS** endpoint
- Crypto/JWT library: **JOSE** (`jose`)
- Password hashing: **Argon2id** (`argon2`)

## Database

- Postgres
- ORM: Prisma (driver adapters)
- Migrations: Prisma migrations (reproducible, committed)

## Cache + Queue

- Redis
- Background jobs: BullMQ (Redis-backed)
- Worker: separate process by default

## Observability

- Logging: `nestjs-pino` / `pino` (structured JSON)
- Tracing + Metrics: OpenTelemetry (OTLP exporter)
- Backend: Grafana Cloud Free (Tempo for traces, Prometheus metrics via OTLP where available)

## Testing

- Unit + integration + e2e: Jest
- HTTP testing: Supertest (Fastify adapter via Nest testing utilities)
- Contract tests: OpenAPI snapshot + Spectral lint (CI gates)
