# ADR: Standardize API Envelope and Problem Details Errors

- Status: Accepted
- Date: 2026-01-08
- Decision makers: Core kit maintainers

## Context

Multiple projects will share clients and internal tooling. Without a consistent response envelope and error shape, every project accumulates bespoke client logic and observability becomes inconsistent.

## Decision

- Success responses use `{ data, meta? }`.
- Errors follow RFC 7807 (`application/problem+json`) and include:
  - `code` (stable error code)
  - `traceId` (equals `X-Request-Id`)
  - optional `otelTraceId` (OpenTelemetry trace id when tracing is enabled)
  - optional validation `errors[]`

## Rationale

- The envelope enables consistent client parsing and pagination.
- RFC 7807 provides a standard error format with room for extensions.
- `traceId` makes incidents debuggable across logs/traces.

## Consequences

- Controllers/services must not invent custom response shapes.
- Exceptions are allowed only with explicit documentation (health/readiness, streams).

## Alternatives Considered

- `{ status, data, message }` style envelopes: rejected (adds noise to all success responses; harder to standardize across services).
- Unstructured errors: rejected (poor client ergonomics and observability).

## Links / References

- `docs/standards/api-response-standard.md`
