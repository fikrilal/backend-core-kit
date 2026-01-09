# ADR: OpenTelemetry with Grafana Cloud (Free)

- Status: Accepted
- Date: 2026-01-08
- Decision makers: Core kit maintainers

## Context

Enterprise-grade systems require:

- traceability across requests and jobs
- metrics for latency and reliability
- standardized instrumentation that works across projects

The organization uses Grafana Cloud Free.

## Decision

- Use OpenTelemetry for traces and metrics.
- Export via OTLP to Grafana Cloud.
- Use structured JSON logs with correlation IDs; logs complement traces/metrics.

## Rationale

- OpenTelemetry is the industry standard and vendor-neutral.
- Grafana Cloud supports OTLP ingestion for traces/metrics (account-tier dependent).

## Consequences

- Projects must configure OTLP endpoint/headers per environment.
- Some metrics export paths may differ depending on Grafana Cloud capabilities; docs must remain accurate.

## Alternatives Considered

- Vendor-specific SDKs: rejected (lock-in, inconsistent ergonomics).
- Logs-only observability: rejected (insufficient for diagnosing distributed issues).

## Links / References

- `docs/standards/observability.md`
- `docs/standards/api-response-standard.md`
