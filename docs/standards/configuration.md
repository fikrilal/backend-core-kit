# Configuration & Secrets Standard

This document defines how configuration and secrets must be handled across environments.

## Environments

Supported environments:

- `development`
- `test`
- `staging`
- `production`

The core kit must behave correctly with environment-provided configuration in each environment.

## Fail Fast Validation

Configuration must be validated at startup:

- strict schema validation (types + ranges + formats)
- startup fails if required config is missing or invalid

Rationale: misconfiguration is a top source of production incidents; fail fast is cheaper than partial boot.

Implementation (current):

- Validation is implemented in `libs/platform/config/env.validation.ts`.
- `NODE_ENV=staging|production` currently requires: `DATABASE_URL`, `REDIS_URL`, `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`.

## Secrets Handling

Rules:

- Never commit secrets to git.
- Do not bake secrets into container images.
- Secrets must be injected at runtime (env vars, mounted files, or secret manager integration).
- Rotation must be possible without code changes (replace secret value, deploy).

## Recommended Config Surface (Baseline)

This is the typical minimal set (exact keys may evolve):

- Runtime
  - `NODE_ENV`
  - `HOST`
  - `PORT`
  - `WORKER_HOST`
  - `WORKER_PORT`
  - `SWAGGER_UI_ENABLED` (optional; defaults on for non-prod, off for prod/test)
- Database
  - `DATABASE_URL`
- Redis / BullMQ
  - `REDIS_URL`
- Auth
  - `AUTH_ISSUER`
  - `AUTH_AUDIENCE`
  - `AUTH_ACCESS_TOKEN_TTL_SECONDS`
  - `AUTH_REFRESH_TOKEN_TTL_SECONDS`
  - `AUTH_JWT_ALG` (e.g., `EdDSA` or `RS256`)
  - `AUTH_SIGNING_KEYS_JSON` (private JWK set, includes current + previous keys, each with `kid`)
- Observability (Grafana Cloud / OTLP)
  - `OTEL_SERVICE_NAME`
  - `OTEL_EXPORTER_OTLP_ENDPOINT`
  - `OTEL_EXPORTER_OTLP_HEADERS` (contains auth header for Grafana Cloud)
  - `LOG_LEVEL`

## Local Development

Local dev may use `.env`, but:

- `.env` is never committed.
- `env.example` is committed and kept up-to-date.

## Rotation-Friendly Key Management

Signing keys must be stored as secrets:

- The service loads a set of private signing keys (current + previous) at startup.
- JWKS publishes public keys derived from the configured set.
- Rotation is managed by updating the configured key set and deploying.

Avoid storing keys as raw strings in code. Treat them as secret material.
