# Adding a Background Job (BullMQ)

This guide standardizes background work so it remains observable and reliable.

## Checklist

- [ ] Job is idempotent (safe under at-least-once execution)
- [ ] Retries are bounded with backoff
- [ ] Failures are actionable (logs + error codes + alerts where appropriate)
- [ ] Job includes correlation context when enqueued from a request
- [ ] Worker runs in a separate process by default

## Steps

1. Define the job payload

- Keep it small.
- Avoid PII; store references and fetch data in the worker if needed.

2. Enqueue the job

- Use a stable queue name.
- Use deterministic `jobId` when possible to dedupe.

3. Process the job

- Wrap execution in tracing spans.
- Emit structured logs with `jobId`.

4. Tests

- Unit test job logic (pure parts).
- Integration test enqueue + process behavior when feasible.
