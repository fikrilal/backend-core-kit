# Platform audit: queue + rbac + redis + storage

Date: 2026-01-20

## Scope

Included:

- `libs/platform/queue/**`
- `libs/platform/rbac/**`
- `libs/platform/redis/**`
- `libs/platform/storage/**`

Reviewed for context:

- `docs/standards/queues-jobs.md`
- `docs/guide/adding-a-job.md`
- `docs/standards/observability.md`
- `docs/standards/authorization-rbac.md`
- `docs/standards/configuration.md`
- `docs/engineering/users/profile-images.md` (storage usage expectations)
- `docs/standards/code-quality.md`
- `docs/standards/security.md`

Excluded:

- Feature-layer usage (`libs/features/**`) except where referenced in docs.
- Worker wiring (`apps/worker/**`) except as implied by queue standards.

Method:

- Static code review + reading unit tests in scope.

## Snapshot

Overall, these modules are compact and mostly aligned with the kit’s standards:

- `queue` has clear naming discipline, reasonable defaults, and first-class trace propagation (`__meta.otel.*`) that matches `docs/standards/queues-jobs.md`.
- `rbac` is readable, documented (`libs/platform/rbac/README.md`), and has solid test coverage around enforcement.
- `redis` and `storage` are thin adapters and “good enough” operationally, but they’re the weakest on testability and config ergonomics.

The biggest opportunities are mostly **P1 maintainability/testability** (reduce duplication, add focused tests) rather than large structural refactors.

## What’s working well

### Queue (`libs/platform/queue`)

- Strong naming gates:
  - `queueName()` enforces a stable DNS-like queue name format.
  - `jobName()` enforces dotted lowerCamelCase segments (readable + consistent).
- Observability:
  - Producer (`QueueProducer.enqueue`) emits an OTel PRODUCER span with queue/job attributes.
  - Worker wrapper emits an OTel CONSUMER span and links it to the producer trace via `__meta.otel.traceparent/tracestate`.
  - There’s a targeted unit test proving trace propagation (`trace-propagation.spec.ts`).
- Safe defaults:
  - `DEFAULT_JOB_OPTIONS` sets bounded retries + backoff + retention limits.

### RBAC (`libs/platform/rbac`)

- Guard flow is explicit and aligns with `docs/standards/authorization-rbac.md`:
  - `@Public()` and `@SkipRbac()` escape hatches are obvious.
  - DB-hydrated roles are enforced for `/v1/admin/*` and can be opted into via `@UseDbRoles()`.
  - Unknown roles deny-by-default.
- `permissions.ts` is small, readable, and test-covered.
- Clear extension point: `RBAC_PERMISSIONS_PROVIDER` token for swapping permission sources.

### Redis (`libs/platform/redis`)

- Reasonable production posture:
  - `lazyConnect: true` + `connectOnStartup` for prod/staging gives fail-fast behavior without penalizing dev ergonomics.
- Simple contract:
  - `isEnabled()` distinguishes configured vs not-configured.

### Storage (`libs/platform/storage`)

- Small, focused S3 adapter; avoids accidental “public bucket” patterns by favoring presigned URLs.
- Correct handling of “NotFound” for idempotent operations (`headObject`, `deleteObject`).
- Presigned PUT correctly signs `Content-Type` as a required header (aligns with `docs/engineering/users/profile-images.md` finalize checks).

## Findings (prioritized)

### P1 — Maintainability: duplicated Redis URL parsing and “enabled” semantics across modules

Evidence:

- `libs/platform/redis/redis.service.ts` parses `REDIS_URL` and derives `enabled/connectOnStartup`.
- `libs/platform/queue/queue.producer.ts` and `libs/platform/queue/queue.worker.ts` parse `REDIS_URL` again and expose their own `isEnabled()`.

Why this matters:

- Drift risk: any future change to Redis configuration parsing (e.g., URL normalization, alternate keys, TLS options, connection naming) has to be implemented in 3 places.
- Operational clarity: “enabled” is currently “configured”, but each module re-derives it independently.

Recommendation:

- Introduce a tiny shared helper under `libs/platform/redis/**` or `libs/platform/config/**`:
  - `getRedisUrl(config: ConfigService): string | undefined` (pure, trims, returns undefined for empty)
  - optionally `assertRedisConfigured(...)` with a consistent error type/message
- Use that helper from:
  - `RedisService`
  - `QueueProducer`
  - `QueueWorkerFactory`

Status:

- Implemented (2026-01-20): shared `normalizeRedisUrl()` and reused it in `RedisService`, `QueueProducer`, and `QueueWorkerFactory`.

### P1 — Operability: `RedisService.onModuleDestroy()` uses `quit()` even for never-connected lazy clients

Evidence:

- `libs/platform/redis/redis.service.ts#onModuleDestroy` always calls `this.client?.quit()`.
- With `lazyConnect: true` and `connectOnStartup=false` (dev/test), `quit()` can trigger a connection attempt during shutdown.

Why this matters:

- In dev/test, a configured-but-unavailable Redis can produce noisy shutdown failures or delays (a “shutdown connects to Redis” footgun).

Recommendation:

- Prefer conditional shutdown:
  - if connected/ready → `quit()`
  - else → `disconnect()` (no network)
- Or: always `disconnect()` for platform baseline, and rely on process teardown (trade-off: less graceful, but predictable).

### P1 — Testability: `RedisService` and `ObjectStorageService` have no unit coverage

Evidence:

- No `*.spec.ts` files exist for:
  - `libs/platform/redis/redis.service.ts`
  - `libs/platform/storage/object-storage.service.ts`

Why this matters:

- These modules are mostly “glue code” where regressions are easy:
  - config gating (`isEnabled` / `assertConfigured`)
  - correct interpretation of provider errors (NotFound mapping)
  - connectOnStartup env policy

Recommendation (low-effort tests):

- For `RedisService`:
  - assert `connectOnStartup` behavior by env (production/staging vs dev/test)
  - assert `isEnabled()` and `getClient()` throws when missing
- For `ObjectStorageService`:
  - mock `client.send` and verify `headObject` / `deleteObject` NotFound mapping
  - assert `assertConfigured()` behavior when partial env is present

### P2 — Security/consistency: presign TTL and key constraints aren’t enforced at the platform boundary

Evidence:

- `ObjectStorageService.presignPutObject/presignGetObject` accept `expiresInSeconds` and `key` directly with no guardrails.

Why this matters:

- Today the kit’s feature usage is safe (server-generated keys + short-lived URLs), but the platform API is permissive enough that a future caller could:
  - accidentally issue long-lived presigned URLs
  - use unexpected key prefixes (integrity boundary)

Recommendation:

- Either:
  - enforce conservative bounds in platform (e.g., `1..900` seconds) and require callers to pass validated inputs, **or**
  - document required invariants explicitly in `libs/platform/storage/**` and `docs/engineering/**` and keep enforcement in feature/app services.

### P2 — RBAC ergonomics: permission “hierarchy” is encoded into action strings but wildcarding is only `*` at full action level

Evidence:

- Permissions like `users:role:write` and `audit:user-role-changes:read` rely on `:` inside the “action” segment (implementation splits on first `:`).
- Wildcards only support `resource === '*'` and `action === '*'` (no `users:role:*` style patterns).

Why this matters:

- This is not wrong, but it should be an explicit design constraint: adding more granular permission namespaces can unintentionally force coarse wildcards (`users:*`) later.

Recommendation:

- Clarify in `docs/standards/authorization-rbac.md` (or `libs/platform/rbac/README.md`) that:
  - permission matching is `(resource, action)` with a single action wildcard, and
  - additional `:` segments live inside `action` and are matched exactly.
- If hierarchical wildcarding becomes necessary, introduce it intentionally (ADR-level change).

## Suggested next backlog (smallest-first)

1. P1: Centralize Redis URL parsing helper and reuse in `queue` + `redis`.
2. P1: Make Redis shutdown semantics predictable for lazy connections.
3. P1: Add focused unit tests for `RedisService` and `ObjectStorageService`.
4. P2: Decide (and document) whether platform enforces presign TTL/key invariants or leaves them to feature services.
5. P2: Clarify RBAC permission matching semantics and wildcard limitations in the RBAC standard/README.
