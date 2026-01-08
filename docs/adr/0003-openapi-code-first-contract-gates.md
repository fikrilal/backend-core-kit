# ADR: Code-First OpenAPI with CI Contract Gates

- Status: Accepted
- Date: 2026-01-08
- Decision makers: Core kit maintainers

## Context

API drift is expensive. We need contract discipline so clients can depend on stable behavior and teams can evolve APIs safely.

## Decision

We will use:
- code-first OpenAPI generation (`@nestjs/swagger`)
- CI contract gates:
  - OpenAPI snapshot verification (generated spec must match committed artifact)
  - Spectral lint (governance checks)
- per-operation error code declarations via `x-error-codes`

## Rationale

- Code-first keeps the contract close to implementation and reduces duplicated effort.
- Snapshot gating prevents “accidental” API changes.
- Spectral lint enforces consistent standards at scale.

## Consequences

- OpenAPI artifacts must be generated and committed as part of API changes.
- Teams must maintain accurate Swagger decorators and error code lists.

## Alternatives Considered

- Spec-first with generated server stubs: rejected for baseline (higher overhead for most teams; slower iteration).
- No gating: rejected (silent breaking changes, inconsistent docs).

## Links / References

- `docs/standards/api-response-standard.md`
- `docs/standards/error-codes.md`

