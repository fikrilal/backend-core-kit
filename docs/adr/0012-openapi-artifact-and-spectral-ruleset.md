# ADR: Commit Generated OpenAPI Artifact and Enforce with Spectral

- Status: Accepted
- Date: 2026-01-08
- Decision makers: Core kit maintainers

## Context

We use code-first OpenAPI generation, but we still need:
- a stable, reviewable contract artifact in git
- consistent governance rules enforced in CI

Without this, API drift and accidental breaking changes are inevitable across projects.

## Decision

- The generated OpenAPI artifact is committed at:
  - `docs/openapi/openapi.json`
- Spectral ruleset/config lives at:
  - `.spectral.yaml`
- CI contract gates:
  1) Generate spec from code and compare to `docs/openapi/openapi.json` (snapshot gate)
  2) Run Spectral lint using `.spectral.yaml` (lint gate)

## Rationale

- A committed snapshot makes API changes explicit in PRs.
- Spectral allows us to enforce standards (envelope, error codes, documentation requirements) at scale.
- Keeping the ruleset in-repo makes it auditable and versioned with the contract.

## Consequences

- API changes must update both code and the generated spec snapshot.
- Teams must keep Swagger decorators accurate and maintain `x-error-codes`.

## Alternatives Considered

- No committed spec (generate only in CI): rejected (harder review; drift is easier).
- Spec-first OpenAPI: rejected for baseline (higher workflow overhead; slower iteration).

## Links / References

- `docs/openapi/README.md`
- `docs/adr/0003-openapi-code-first-contract-gates.md`
- `docs/standards/error-codes.md`

