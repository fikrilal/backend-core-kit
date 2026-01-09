# ADR: Use OpenAPI YAML Snapshot and Expose Swagger UI (Non-Prod)

- Status: Accepted
- Date: 2026-01-09
- Decision makers: Core kit maintainers

## Context

We commit a generated OpenAPI artifact and enforce it with Spectral, but we also need:

- a snapshot format that is readable in PR diffs
- a standard way to browse the contract locally (without external tooling)
- a safe default for production (docs endpoints can leak info)

## Decision

- The generated OpenAPI snapshot is committed as YAML:
  - `docs/openapi/openapi.yaml`
- The API serves Swagger UI at:
  - `/docs` (plus `docs-json` / `docs-yaml` endpoints provided by Nest Swagger)
- Swagger UI is enabled by default when `NODE_ENV` is not `production` or `test`.
  - Override with `SWAGGER_UI_ENABLED=true|false`.

This supersedes `docs/adr/0012-openapi-artifact-and-spectral-ruleset.md` (JSON snapshot location).

## Rationale

- YAML is easier to review and diff than JSON for most contract changes.
- Swagger UI accelerates local development and debugging.
- Disabling UI in production reduces accidental exposure and attack surface.

## Consequences

- API changes must update the committed YAML snapshot and keep Spectral passing.
- Runtime includes Swagger dependencies (used only when UI is enabled).

## Alternatives Considered

- JSON snapshot: rejected (worse diffs).
- No Swagger UI: rejected (slower dev workflow).
- Swagger UI in production: rejected (unnecessary exposure).

## Links / References

- Related ADRs:
  - `docs/adr/0012-openapi-artifact-and-spectral-ruleset.md`
- Related docs:
  - `docs/openapi/README.md`
