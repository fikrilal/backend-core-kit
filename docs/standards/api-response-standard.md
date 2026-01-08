# API Response Standard

This document defines **mandatory** response shapes, headers, and status code rules for all HTTP endpoints in this core kit.

## Success Envelope

All successful JSON responses use this envelope:

```json
{ "data": { } }
```

### Lists

List endpoints return:

```json
{
  "data": [ { } ],
  "meta": { "nextCursor": "…", "limit": 25 }
}
```

Rules:
- `data` is always present (object or array) for successful JSON responses.
- `meta` is optional.
- Do **not** add `status`, `success`, or `message` fields to the success envelope by default.
- For endpoints that truly return no content, use `204 No Content` and no body.

### Exceptions

Allowed exceptions must be explicit and documented (e.g., `/health`, `/ready`, file/stream responses). For JSON endpoints, the envelope is the default.

## Errors (RFC 7807 / Problem Details)

All errors must return:
- Content-Type: `application/problem+json`
- Body (RFC 7807 + extensions):

```json
{
  "type": "about:blank",
  "title": "Validation Failed",
  "status": 400,
  "detail": "Human-friendly message",
  "code": "VALIDATION_FAILED",
  "traceId": "4c2e6e3a-…",
  "errors": [
    { "field": "email", "message": "Must be a valid email" }
  ]
}
```

Rules:
- `code` is required and stable. See `docs/standards/error-codes.md`.
- `traceId` is required and equals the `X-Request-Id` value.
- `errors[]` is optional and used for validation-style details.
- Do not include stack traces or internal error details.

## Required Headers

- `X-Request-Id`
  - Accepted from `x-request-id`.
  - Generated if missing.
  - Echoed on every response (success and error).

### Write Safety Headers (when applicable)

- `Idempotency-Key`
  - Accepted on write endpoints (`POST`, `PUT`, `PATCH`, `DELETE`) where safe retries are needed.
- `Idempotency-Replayed: true`
  - Set when a request is de-duplicated and a cached response is returned.
- `Location`
  - Set on `201 Created` with the resource URL (absolute or path).

## Status Code Rules (Baseline)

- `200 OK`: successful GET/PUT/PATCH (and POST replay) returning JSON.
- `201 Created`: successful POST creating a resource; include `Location`.
- `204 No Content`: delete/command endpoints with no response body.
- `400 Bad Request`: invalid input / validation failure.
- `401 Unauthorized`: missing/invalid auth.
- `403 Forbidden`: authenticated but not allowed.
- `404 Not Found`: missing resource.
- `409 Conflict`: version conflicts, duplicates, idempotency-in-progress, etc.
- `429 Too Many Requests`: throttling / lockout.
- `5xx`: unexpected errors; always return a stable `code` and a generic message.

## OpenAPI Requirements

- Success schemas must model the `{ data, meta? }` envelope.
- Errors must reference a shared `ProblemDetails` schema.
- Each operation lists possible `code` values under `x-error-codes`.

