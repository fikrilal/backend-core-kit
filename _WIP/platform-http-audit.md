# Platform HTTP audit

Date: 2026-01-19

## Scope

Included:

- `libs/platform/http/**`
  - `fastify-adapter.ts` + `fastify-hooks.ts`
  - RFC7807 errors: `filters/problem-details.filter.ts`, `errors/problem.exception.ts`
  - success envelope: `interceptors/response-envelope.interceptor.ts`
  - list query: `list-query/*`
  - idempotency: `idempotency/*`
  - OpenAPI decorators: `openapi/*`

Reviewed for context:

- `docs/standards/api-response-standard.md`
- `docs/standards/error-codes.md`
- `docs/standards/pagination-filtering-sorting.md`
- `docs/standards/observability.md`
- `docs/standards/security.md`

Excluded:

- app bootstraps/wiring (`apps/**`) except for “how the platform is applied” context
- feature-layer controllers (`libs/features/**`)

Method:

- Static code review + reading unit tests in scope.
- Small fix implemented: P0 5xx detail redaction in `ProblemDetailsFilter`.

## Snapshot

`libs/platform/http` is small but high leverage: it defines the core HTTP behavior for the whole system (envelope, errors, request-id correlation, query parsing, and idempotency).

The module is generally clean and aligned with the docs, with two notable mismatches:

1. error responses can leak internal details on unexpected 5xx errors
2. the success envelope interceptor can emit a non-standard `{ data, meta?, extra? }` shape

## What’s working well

- **Request correlation** is first-class:
  - `registerFastifyHttpPlatform` ensures `X-Request-Id` exists and strips query strings from tracing attributes (`http.target`, `url.path`, `url.full`).
- **Query parsing is security-aware**:
  - Fastify query parser uses `qs` with `allowPrototypes: false` and `plainObjects: true` (`libs/platform/http/fastify-adapter.ts`).
- **Problem details format is consistent**:
  - `ProblemDetailsFilter` maps `HttpException` into RFC7807 and ensures `Content-Type: application/problem+json`.
  - default `code` mapping matches `docs/standards/error-codes.md` for common statuses.
- **List query implementation matches the standard**:
  - `ListQueryPipe` validates the DTO and maps parsing issues to `VALIDATION_FAILED` with `errors[]` (`libs/platform/http/list-query/list-query.pipe.ts`).
  - `ApiListQuery` provides good OpenAPI ergonomics for query params.
- **Idempotency layer is reasonably scoped**:
  - per-user Redis keys, request-hash reuse detection, and “don’t cache errors” behavior are solid defaults.

## Findings (prioritized)

### P0 — Security: unexpected 5xx errors can leak internal details in `detail`

Evidence:

- `ProblemDetailsFilter` sets `detail = exception.message` for any `Error` that isn’t an `HttpException`:
  - `libs/platform/http/filters/problem-details.filter.ts`

Why this matters:

- The standard is explicit: “Do not include stack traces or internal error details.”
- Many thrown errors in infra layers include sensitive implementation details (SQL fragments, provider responses, internal invariants).

Recommendation:

- For `status >= 500` and the exception is not a deliberately surfaced `HttpException`/`ProblemException`, emit a **generic** `title/detail` (or omit `detail`) and rely on server-side logs/traces for diagnosis.
- Keep `traceId` in the response (required) and ensure server logs include the real error with that traceId (but never include secrets).
- Add unit coverage that a thrown `Error('boom')` returns `detail` either omitted or generic for 500.

Status:

- Implemented (2026-01-19): `ProblemDetailsFilter` no longer includes `exception.message` in 5xx `detail` for unexpected `Error` exceptions; unit test updated.

### P0 — Contract: envelope interceptor can emit a non-standard shape (`extra`)

Evidence:

- The “auto-list” branch converts `{ items, nextCursor?, limit?, hasMore?, ...rest }` into:
  - `{ data: items, meta?, extra?: rest }`
  - `libs/platform/http/interceptors/response-envelope.interceptor.ts`

Why this matters:

- `docs/standards/api-response-standard.md` is normative: success JSON responses are `{ data, meta? }`.
- An `extra` field is not part of the contract and will drift OpenAPI and clients.

Recommendation:

- Remove the `extra` field to keep the envelope shape stable.
- If “rest fields” are truly needed, move them into `meta` (only if they are metadata) or require endpoints to explicitly `@SkipEnvelope()` and document the exception.
- Consider tightening the “auto-list” detection so only the known list result shape is transformed (avoid accidental matches on unrelated `{ items: [...] }` objects).

Status:

- Implemented (2026-01-19): `ResponseEnvelopeInterceptor` no longer emits top-level `extra`; any additional fields on `{ items, ... }` are merged into `meta` and covered by a unit test.
  - Hardening: metadata merging uses object spread to avoid `Object.assign` triggering the `__proto__` setter.

### P1 — Operability: `HTTP_TRUST_PROXY` parsing is ad-hoc and can be silently ignored

Evidence:

- `createFastifyAdapter()` includes a local `parseEnvBoolean()` and treats invalid values as “unset”:
  - `libs/platform/http/fastify-adapter.ts`

Why this matters:

- `docs/standards/security.md` calls out proxy trust as production-impacting.
- Silent ignore makes misconfiguration harder to detect during deploys.

Recommendation:

- Centralize this under `libs/platform/config/**` and/or enforce validation (fail fast) in production-like envs.
- At minimum: if `HTTP_TRUST_PROXY` is set but invalid, throw during bootstrap or surface a warning.

### P1 — Correctness: `registerFastifyHttpPlatform` comment claims not-found behavior but doesn’t implement it

Evidence:

- Both bootstraps rely on this function for “not found behavior”, but it only adds an `onRequest` hook:
  - `libs/platform/http/fastify-hooks.ts`
  - `apps/api/src/bootstrap.ts` / `apps/worker/src/bootstrap.ts`

Why this matters:

- This is a classic “false sense of safety” issue: readers will assume unmatched routes are mapped into RFC7807 with the right headers/codes.

Recommendation:

- Either implement a Fastify `setNotFoundHandler` that returns RFC7807 `NOT_FOUND` with `traceId`, or
- Update the comment and add a small integration test/assertion (or a doc note) confirming the actual behavior.

### P1 — Abuse resistance: idempotency hashing + replay caching has no explicit size bounds

Evidence:

- Request hash uses `stableStringify({ query, body })` without a max depth/size.
- Successful response bodies are stored in Redis without a max size.
  - `libs/platform/http/idempotency/idempotency.service.ts`

Why this matters:

- Idempotency should be safe-by-default even if someone accidentally annotates a large-payload endpoint.
- Without bounds, “safe retries” can become “store large blobs in Redis” and create avoidable memory pressure.

Recommendation:

- Add a conservative upper bound for:
  - request hash input size (or limit stableStringify output length)
  - cached response body size (or disable caching for large responses)
- Consider documenting “idempotency is for small JSON bodies; do not use on uploads/streams”.

### P2 — Docs/contract: idempotency header is documented as `uuid` but not validated as such

Evidence:

- OpenAPI decorator declares `Idempotency-Key` as `{ type: string, format: uuid }`.
- Runtime accepts any non-empty string up to 128 chars.
  - `libs/platform/http/openapi/api-idempotency-key.decorator.ts`
  - `libs/platform/http/idempotency/idempotency.service.ts`

Recommendation:

- Either validate UUID (strict), or update the decorator to document it as an opaque string.

Status:

- Implemented (2026-01-19): OpenAPI now documents `Idempotency-Key` as an opaque string with `minLength: 1` and `maxLength: 128` (recommended UUIDv4), matching runtime behavior.

### P2 — Maintainability: repeated “flatten validation errors” helpers across bootstraps and list-query pipe

Evidence:

- Similar `flattenValidationErrors(...)` exists in:
  - `apps/api/src/bootstrap.ts`
  - `apps/worker/src/bootstrap.ts`
  - `libs/platform/http/list-query/list-query.pipe.ts` (local variant)

Recommendation:

- Centralize a single helper under `libs/platform/http/validation/validation-errors.ts` (or `libs/shared/validation/**`) and reuse it in bootstraps and pipes.

Status:

- Implemented (2026-01-19): extracted `flattenValidationErrors` into `libs/platform/http/validation/validation-errors.ts` and reused it in both app bootstraps and `ListQueryPipe`.

## Suggested next backlog (smallest-first)

1. P0: remove internal detail leakage for unexpected 5xx errors (and add tests).
2. P0: remove/replace `extra` in `ResponseEnvelopeInterceptor` auto-list behavior to match `{ data, meta? }`.
3. P1: make `HTTP_TRUST_PROXY` parsing fail-fast in production-like envs (align with config validation).
4. P1: either implement a not-found handler that produces RFC7807 or correct the misleading comment + prove behavior.
5. P1: add size bounds for idempotency hashing and cached response bodies.
6. P2: align `ApiIdempotencyKeyHeader` docs with runtime behavior (uuid vs opaque string).
7. P2: centralize `flattenValidationErrors` helper to reduce drift.
