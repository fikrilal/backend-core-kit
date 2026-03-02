# Reliability Defaults

This document defines baseline reliability requirements that prevent common production failures.

## Timeouts (Everywhere)

Rules:

- Server has request timeouts (to avoid stuck connections).
- DB has statement/query timeouts where supported.
- Redis commands have timeouts and bounded retries.
- Outbound HTTP calls have timeouts by default.

Implementation defaults (current):

- Fastify (`libs/platform/http/fastify-adapter.ts`)
  - `HTTP_REQUEST_TIMEOUT_MS` default `30000`
  - `HTTP_CONNECTION_TIMEOUT_MS` default `10000`
  - `HTTP_KEEP_ALIVE_TIMEOUT_MS` default `72000`
  - `HTTP_BODY_LIMIT_BYTES` default `1048576`
  - `HTTP_PLUGIN_TIMEOUT_MS` default `10000`
- Redis (`libs/platform/redis/redis.service.ts`)
  - `REDIS_CONNECT_TIMEOUT_MS` default `10000`
  - `REDIS_COMMAND_TIMEOUT_MS` default `5000`
  - `REDIS_MAX_RETRIES_PER_REQUEST` default `2`
  - `REDIS_RETRY_BASE_DELAY_MS` default `100`
  - `REDIS_RETRY_MAX_DELAY_MS` default `2000`
  - `REDIS_ENABLE_OFFLINE_QUEUE` default `true`

## Retries (Only Where Safe)

Rules:

- Only retry idempotent operations or operations protected by idempotency keys.
- Use exponential backoff with jitter.
- Bound retries (no infinite loops).

Implementation defaults (current):

- Platform DB transaction retry (`libs/platform/db/tx-retry.ts`)
  - `maxAttempts` default `3`
  - exponential backoff base delay `25ms`
  - max delay cap `250ms`
  - jitter ratio `0.2`

## Idempotency Keys (Write Endpoints)

Write endpoints that may be retried by clients must support:

- `Idempotency-Key` request header
- replay detection + cached response
- concurrency lock to avoid duplicated work

Replayed responses must include:

- `Idempotency-Replayed: true`

Notes:

- Idempotency is intended for **small JSON** write endpoints (commands that return small responses).
- The platform uses conservative size bounds for hashing and replay caching; oversized responses may not be cached and therefore cannot be replayed (the request may be re-executed on retry). Do not use idempotency on uploads/streams.

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
