# ADR: Standardize on npm

- Status: Accepted
- Date: 2026-01-08
- Decision makers: Core kit maintainers

## Context

The core kit needs a stable, widely available package manager across developer machines and CI environments.

## Decision

We standardize on npm.

## Rationale

- npm is available everywhere Node is installed.
- It reduces onboarding friction for teams and CI environments.

## Consequences

- We do not assume pnpm/yarn-specific features.

## Alternatives Considered

- pnpm: good ergonomics for monorepos, but not selected for baseline.
- yarn: not selected for baseline.

## Links / References

- `docs/core/project-stack.md`
