# ADR: Structured Logging with nestjs-pino (Pretty in Dev)

- Status: Accepted
- Date: 2026-01-09
- Decision makers: Core kit maintainers

## Context

This core kit must ship with production-grade logging:

- JSON structured logs for aggregation and querying
- correlation IDs for tracing incidents across requests and jobs
- safe defaults (no secrets / minimized PII)
- good developer ergonomics (readable logs in local development)

## Decision

- Use `nestjs-pino` + `pino` as the default logger for **both** API and worker processes.
- Default behavior:
  - `NODE_ENV=development`: pretty logs via `pino-pretty`
  - `NODE_ENV=staging|production`: JSON logs
  - `NODE_ENV=test`: logs are silent by default
- Correlation:
  - Accept `X-Request-Id` from clients; generate if missing.
  - Echo `X-Request-Id` on all responses.
  - Log `requestId` and `traceId` (initially equal; later `traceId` will come from OpenTelemetry spans).
- Reduce noise: exclude `/health` and `/ready` from automatic HTTP request logging.
- Redact sensitive fields (auth headers, cookies, tokens, signing key material) as a defense-in-depth measure.

## Implementation

- Platform module: `libs/platform/logging/logging.module.ts`
- Bootstrap wiring:
  - `apps/api/src/bootstrap.ts`
  - `apps/worker/src/bootstrap.ts`

## Consequences

- Do not use `console.*`; use `PinoLogger`/Nest logger so logs remain structured and correlated.
- Feature code should log identifiers (ids) rather than raw PII.
