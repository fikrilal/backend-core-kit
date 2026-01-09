# Queues & Jobs Standard (BullMQ)

This core kit uses BullMQ (Redis-backed) for background work. A separate worker process is the baseline.

## Principles

- At-least-once delivery is assumed; jobs must be idempotent.
- Retries use backoff and only for safe operations.
- Job execution is observable (logs + traces + metrics).

## Queue Naming

Queue names should be stable and domain-aligned:

- `emails`
- `notifications`
- `exports`
- `webhooks`

Avoid environment-specific names; environment is handled by Redis configuration and service naming.

Implementation (current):

- Define queue names with `queueName()` from `libs/platform/queue/queue-name.ts`.
- Prefer one worker per queue per process; scale out by running more worker processes.

## Job Naming

Jobs must include a clear name:

- `user.sendVerificationEmail`
- `wallet.processTransfer`

Implementation (current):

- Define job names with `jobName()` from `libs/platform/queue/job-name.ts`.

## Retry Policy

Rules:

- Use bounded retries (e.g., 3–10 attempts).
- Use exponential backoff with jitter for external calls.
- Do not retry non-idempotent operations without an idempotency strategy.

## Dead Letter / Failure Handling

Baseline:

- After max attempts, jobs remain in “failed” state for inspection.
- Provide runbook guidance for requeueing, alerting, and investigation.

## Idempotency

Idempotency options:

- Deterministic `jobId` for naturally idempotent jobs (dedupe at enqueue).
- Application-level idempotency keys stored in Redis/DB for “do once” semantics.

Notes:

- BullMQ disallows `:` in `jobId`; prefer `jobName-runId` or similar.

## Scheduling / Cron

Rules:

- Avoid ad-hoc `setInterval` in app code for critical jobs.
- Prefer BullMQ repeatable jobs or a single scheduler component that enqueues jobs.
- Ensure “no double-run” behavior using repeatable job keys and/or distributed locks.

## Correlation / Tracing

Jobs should carry correlation context:

- include `requestId/traceId` when enqueued from an API request
- include job identifiers in logs and traces

## Dashboard (Roadmap)

BullMQ has excellent dashboard options (e.g., Bull Board), but this kit will only enable a dashboard after auth/RBAC exists so it cannot be exposed accidentally.

## Code Entry Points (Current)

- Producer API: `libs/platform/queue/queue.producer.ts`
- Worker factory: `libs/platform/queue/queue.worker.ts`
- Module wiring: `libs/platform/queue/queue.module.ts`
