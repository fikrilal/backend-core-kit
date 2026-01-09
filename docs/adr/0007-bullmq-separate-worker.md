# ADR: BullMQ with a Separate Worker Process

- Status: Accepted
- Date: 2026-01-08
- Decision makers: Core kit maintainers

## Context

Background jobs are required in most real systems (emails, notifications, long-running processing). They need:

- retries/backoff
- concurrency control
- observability
- safe deployment and scaling

## Decision

- Use BullMQ (Redis-backed) as the only supported queue.
- Run workers as a separate process by default.

## Rationale

- BullMQ is mature, widely used, and operationally simple with Redis.
- Separating worker from API improves reliability and scaling:
  - API latency is not impacted by heavy background work
  - workers can be scaled independently
  - deployments can roll independently if needed

## Consequences

- Projects deploy (at least) two processes/containers.
- Shared code must be structured to be used by both processes.

## Alternatives Considered

- In-process workers only: rejected (resource contention; harder scaling; riskier deployments).
- Cloud-managed queues: rejected by requirement (not allowed in this kit).

## Links / References

- `docs/standards/queues-jobs.md`
