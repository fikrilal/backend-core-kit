# Reliability Defaults

This document defines baseline reliability requirements that prevent common production failures.

## Timeouts (Everywhere)

Rules:
- Server has request timeouts (to avoid stuck connections).
- DB has statement/query timeouts where supported.
- Redis commands have timeouts and bounded retries.
- Outbound HTTP calls have timeouts by default.

## Retries (Only Where Safe)

Rules:
- Only retry idempotent operations or operations protected by idempotency keys.
- Use exponential backoff with jitter.
- Bound retries (no infinite loops).

## Idempotency Keys (Write Endpoints)

Write endpoints that may be retried by clients must support:
- `Idempotency-Key` request header
- replay detection + cached response
- concurrency lock to avoid duplicated work

Replayed responses must include:
- `Idempotency-Replayed: true`

## Graceful Shutdown

On `SIGTERM`/`SIGINT`:
- stop accepting new work
- drain in-flight requests
- close resources (DB, Redis, queue)
- exit only after shutdown completes or a hard timeout elapses

## Readiness vs Liveness

- `/health`: the process is alive.
- `/ready`: the process can serve traffic (DB/Redis connected, migrations applied where required).

## Backpressure

Rules:
- Use bounded concurrency in workers.
- Use rate limiting on sensitive endpoints (auth, OTP, etc.).
- Avoid unbounded memory growth (stream large responses, cap payload sizes).

