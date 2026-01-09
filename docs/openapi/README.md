# OpenAPI (Code-First) — Generated Contract

This repository uses **code-first** OpenAPI generation.

## Artifact Location (Standard)

- Generated OpenAPI artifact is committed at:
  - `docs/openapi/openapi.yaml`

The committed file is the contract snapshot used by CI gates.

## How It’s Used

CI enforces:

1. **Snapshot gate**

- Generate OpenAPI from code.
- Compare to `docs/openapi/openapi.yaml`.
- Fail if there is a diff.

2. **Lint gate**

- Run Spectral against `docs/openapi/openapi.yaml` using `.spectral.yaml`.

## Swagger UI

- Swagger UI is available at `/docs` in non-production environments by default.
- Raw docs are available at `/docs-json` and `/docs-yaml`.
- Disable with `SWAGGER_UI_ENABLED=false`.

## Notes

- The OpenAPI artifact is generated from the API application (not the worker).
- Endpoints must document `x-error-codes` and follow the envelope/error standards:
  - `docs/standards/api-response-standard.md`
  - `docs/standards/error-codes.md`
