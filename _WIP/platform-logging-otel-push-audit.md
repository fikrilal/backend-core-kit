# Platform audit: logging + otel + push

Date: 2026-01-20

## Scope

Included:

- `libs/platform/logging/**`
  - `logging.module.ts`
  - `redaction.ts`
- `libs/platform/otel/**`
  - `telemetry.ts`
- `libs/platform/push/**`
  - `push.module.ts`
  - `push.jobs.ts`
  - `push.queue.ts`
  - `push.job.ts`
  - `push.types.ts`
  - `fcm-push.service.ts`
  - `disabled-push.service.ts`

Reviewed for context:

- `docs/standards/observability.md`
- `docs/standards/security.md`
- `docs/standards/configuration.md`
- `docs/standards/queues-jobs.md`
- `docs/standards/code-quality.md`
- `docs/adr/0016-structured-logging-with-nestjs-pino.md`

Excluded:

- `libs/platform/http/**` (but note: it owns `X-Request-Id` response echo + OTel safe URL span attrs)
- `libs/platform/queue/**` (push depends on it, but this audit doesn’t review queue implementation)
- feature-layer integrations (`libs/features/**`) and worker job wiring (`apps/**`)

Method:

- Static code review + reading unit tests in scope.
- P1 items implemented (2026-01-20): bounded requestId helper + typed push error codes.

## Snapshot

Overall, `libs/platform/{logging,otel,push}` is compact, readable, and largely aligned with the standards:

- Logging is structured and correlated (requestId/traceId + OTel IDs when available).
- Tracing is initialized early and exports via OTLP as documented.
- Push provider abstraction is clean, with tests covering FCM happy path and a key non-retryable error.

Main opportunities:

1. Harden requestId handling (bounds + shared helper) to reduce abuse surface and duplication.
2. Tighten error-code discipline in push errors (avoid mixing internal and provider codes).
3. Reduce “singletons by convention” and clarify lifecycle expectations (telemetry init, firebase-admin app reuse).

## What’s working well

### Logging (`libs/platform/logging`)

- Uses `nestjs-pino` with sane defaults per ADR 0016:
  - `development`: pretty logs by default
  - `test`: silent
  - `staging|production`: JSON structured logs
- Correlation:
  - accepts `X-Request-Id`, generates if missing, and ensures raw Node request + Fastify request stay in sync (via `req.id`/`req.requestId`).
  - logs include `requestId` and `traceId` (currently equal to requestId), plus `otelTraceId`/`otelSpanId` when in an active span.
- Defense-in-depth redaction exists and removes sensitive fields from pino-http logs.
- `/health` and `/ready` are excluded from automatic HTTP request logging (noise control).

### Telemetry (`libs/platform/otel`)

- Simple enabling rule: only enabled outside `test` and when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- Uses `@opentelemetry/sdk-node` + auto-instrumentations with an explicit ignore hook for `/health` + `/ready`.
- Uses consistent `service.name` and `deployment.environment` attributes.
- Safe URL span attributes + requestId correlation are handled (correctly) in `libs/platform/http/fastify-hooks.ts` (out of scope, but relevant to correctness).

### Push (`libs/platform/push`)

- Clear DI boundary: `PushService` interface + `PUSH_SERVICE` token, switching between FCM and disabled implementation.
- FCM credentials support:
  - ADC (`FCM_USE_APPLICATION_DEFAULT=true`)
  - mounted file path (`FCM_SERVICE_ACCOUNT_JSON_PATH`)
  - raw JSON (`FCM_SERVICE_ACCOUNT_JSON`) (dev convenience)
- `PushJobs` is minimal and uses the platform queue producer (so it inherits queue tracing/correlation behavior).
- Tests exist for:
  - FCM happy path
  - one key non-retryable “unregistered token” case
  - PushJobs enabled/disabled and enqueue shape

## Findings (prioritized)

### P1 — Security/operability: requestId is accepted without bounds and logic is duplicated across layers

Evidence:

- `libs/platform/http/request-id.ts`: centralizes requestId normalization with a length cap + allowlist.
- `libs/platform/logging/logging.module.ts` and `libs/platform/http/fastify-hooks.ts` both use the shared helper.

Why this matters:

- Even with header size limits, allowing arbitrary `X-Request-Id` values can:
  - create noisy logs/traces (very long IDs)
  - increase memory/CPU churn under load (esp. if downstream systems index the field)
  - complicate incident response if IDs contain unexpected characters
- Duplication increases drift risk (one path gains hardening; the other doesn’t).

Recommendation:

- Centralize a single `getOrCreateRequestId(...)` helper under `libs/platform/http/**` or `libs/shared/**`.
- Apply a length cap (e.g., 128–256 chars) and a conservative allowlist (e.g., `[a-zA-Z0-9._-]`) with fallback to `randomUUID()`.
- Keep the response echo (`X-Request-Id`) unchanged (already handled in HTTP platform).

Status:

- Implemented (2026-01-20).

### P1 — Consistency: push error codes mix stable internal codes and raw provider codes

Evidence:

- `libs/platform/push/push.types.ts`:
  - `PushSendError.code: PushErrorCode` (stable internal)
  - `PushSendError.providerCode?: string` (provider-specific)
- `libs/platform/push/fcm-push.service.ts` maps Firebase codes to stable internal codes and preserves the provider code separately.

Why this matters:

- This is easy to mis-handle upstream:
  - stable codes (`push/*`) are suitable for alerting/metrics and branching.
  - provider codes (`messaging/*`) are not stable across providers and don’t match the kit’s “no raw string codes” discipline.

Recommendation:

- Split fields:
  - `code: PushErrorCode` (stable internal)
  - `providerCode?: string` (opaque provider-specific)
- Or, keep `code` stable and attach provider code in `causeName`/`details` instead.
- Add a small internal `PushErrorCode` union/enum under `libs/shared/error-codes.ts` or a push-specific shared file (platform must remain feature-free).

Status:

- Implemented (2026-01-20).

### P2 — Maintainability: OTel and logging duplicate small env parsing and “service name” conventions

Evidence:

- `libs/platform/logging/logging.module.ts` uses `ConfigService` to read `NODE_ENV` + `OTEL_SERVICE_NAME`.
- `libs/platform/otel/telemetry.ts` reads directly from `process.env` (necessary at bootstrap time), with its own `getNodeEnv()` and `getServiceName()`.

Why this matters:

- Drift risk: service name composition and env normalization can diverge over time.

Recommendation:

- Share a tiny “pure” helper under `libs/platform/config/**` that:
  - normalizes `NODE_ENV` safely from a raw string
  - derives `service.name` from `OTEL_SERVICE_NAME` + `role`
- Keep `telemetry.ts` bootstrap-safe (no Nest dependencies).

### P2 — Test coverage gap: logging + telemetry behavior is not directly unit-tested

Evidence:

- Push has unit tests; logging module and telemetry init do not.

Why this matters:

- Most regressions here are operational (wrong levels, missing redactions, missing attributes) and are hard to catch without targeted unit tests.

Recommendation:

- Add a small unit test suite that asserts:
  - LOG_LEVEL defaulting by `NODE_ENV`
  - redaction paths contain baseline secrets
  - telemetry enabled/disabled behavior for `NODE_ENV=test` and missing endpoint

### P2 — Push ergonomics: payload sizing and validation constraints aren’t explicit

Evidence:

- `SendPushToTokenInput.data` is `Record<string, string>` with no explicit size limits.
- FCM has payload size constraints; violations will be provider errors.

Recommendation:

- Document expected max sizes (data keys/values and total payload size) in `docs/engineering/` (new doc), or add preflight validation in `FcmPushService` to fail fast with a stable internal error code.

## Suggested next backlog (smallest-first)

1. ✅ P1: Centralize requestId helper + apply bounds/allowlist (logging + fastify hooks). (done)
2. ✅ P1: Split push internal error codes from provider codes; type them. (done)
3. P2: Share `NODE_ENV`/service-name helpers between logging + telemetry.
4. P2: Add focused unit coverage for logging + telemetry defaults.
5. P2: Document/enforce push payload size constraints.
