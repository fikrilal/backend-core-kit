# Observability Standard (Logs, Traces, Metrics)

This document defines the baseline observability requirements for services built from this core kit.

## Structured Logging (JSON)

Rules:

- Logs are structured JSON by default.
- Every log line includes correlation identifiers when available:
  - `requestId` / `traceId`
  - `userId` (when authenticated)
  - `jobId` (in worker context)
- Do not log secrets.
- PII must be minimized and redacted where possible.

### PII Redaction

Baseline guidance:

- Never log raw tokens, passwords, API keys, refresh tokens.
- Avoid logging full emails/phone numbers; if needed, mask.
- Prefer logging identifiers (userId) rather than raw user attributes.

## Request Correlation

Rules:

- Accept `x-request-id` from clients.
- Generate if missing.
- Echo on response header `X-Request-Id`.
- Include in all logs and problem-details errors as `traceId`.

## Tracing (OpenTelemetry)

Baseline requirements:

- Instrument inbound HTTP requests.
- Instrument outbound calls where practical (HTTP clients, DB, Redis, queue).
- Export traces via OTLP to Grafana Cloud.

Recommended resource attributes:

- `service.name` (OTEL service name)
- `deployment.environment` (development/staging/production)
- `service.version` (release/version)

## Metrics

Baseline metrics (minimum):

- HTTP request duration + status code counts
- DB query durations (if supported)
- BullMQ job duration + success/failure counts

Export metrics via OTLP where supported in Grafana Cloud Free; otherwise export to Prometheus-compatible endpoints and scrape.

## Health Endpoints

Two endpoints:

- `/health` (liveness): returns OK if process is alive
- `/ready` (readiness): returns OK only if dependencies are ready (DB, Redis)

Health endpoints may be exceptions to the response envelope (documented).

## Dashboards & Alerts

Baseline expectation:

- Provide a minimal dashboard set (API latency, error rate, worker failures).
- Provide a minimal alert set (5xx rate, DB unavailable, Redis unavailable, job failure spikes).

Templates should live under docs when added (e.g., `docs/observability/dashboards/`).
