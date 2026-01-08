# ADR: Enforce Architecture Boundaries Automatically (Dependency Cruiser)

- Status: Accepted
- Date: 2026-01-08
- Decision makers: Core kit maintainers

## Context

Architectural boundaries (“domain/app/infra”, platform vs features) only work when they are enforced.

Manual code review is not sufficient because:
- reviewers miss violations under time pressure
- boundaries erode gradually (“just this one import”)
- violations increase coupling and make later multi-tenancy/extraction/refactors expensive

## Decision

We will enforce boundaries automatically in CI using **dependency-cruiser**:
- detect forbidden imports based on directory rules
- detect circular dependencies
- fail CI on violations

This enforcement is part of the core kit’s “production baseline” and not optional.

## Rationale

- dependency-cruiser is purpose-built for dependency rule enforcement and cycle detection.
- It is independent from code style and catches architectural violations reliably.
- It scales as the repo grows and complements ESLint.

## Consequences

- The repository layout must remain consistent (`apps/`, `libs/platform`, `libs/features/.../(domain|app|infra)`).
- Some “convenient” shortcuts (importing infra into app, importing features into platform) are disallowed by design.

## Alternatives Considered

- Review-only enforcement: rejected (does not scale; boundaries erode).
- ESLint-only path rules: partial (good for fast feedback but weaker for cycle detection).
- Nx/enforced module boundaries: rejected for baseline (requires adopting Nx; not chosen).

## Links / References

- `docs/core/project-architecture.md`
- `docs/standards/code-quality.md`

