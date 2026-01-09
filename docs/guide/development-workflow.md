# Development Workflow

This document defines the expected development workflow for projects using this core kit.

## Day-to-Day Commands (Expected)

These are the typical commands a project should provide:

- `npm run lint`
- `npm run format`
- `npm run typecheck`
- `npm run deps:check` (dependency boundaries + cycles)
- `npm test`
- `npm run test:e2e`
- `npm run openapi:generate` (or similar)
- `npm run openapi:lint` (Spectral)

When code is scaffolded, keep these commands stable; they form the project’s “golden path”.

## PR Expectations

- Keep PRs small and scoped.
- Update docs when behavior changes (especially API contracts and error codes).
- If you introduce a new pattern: add an ADR in `docs/adr/`.

## Contract Discipline (Non-Negotiable)

Every PR must keep these gates green:

- OpenAPI snapshot is up-to-date and committed.
- Spectral lint passes.
- Error codes documented via `x-error-codes`.

## Release Hygiene (Baseline)

Even if automation is added later, design for:

- immutable builds
- environment-driven configuration
- migration strategy (`prisma migrate deploy` gated)
