# ADR: TypeScript Strict Mode and No-`any` Policy

- Status: Accepted
- Date: 2026-01-08
- Decision makers: Core kit maintainers

## Context

This core kit is reused across many projects. Type drift and “escape hatch” typing (`any`) create long-term maintenance costs and production defects, especially in fast-moving codebases with multiple teams.

We want a baseline that:
- catches whole classes of bugs early (compile time)
- keeps refactors safe
- prevents gradual degradation of types

## Decision

- TypeScript is configured with `strict: true`.
- `any` is forbidden:
  - no explicit `any`
  - no implicit `any`
  - no `as any`
- Linting enforces the no-`any` policy (CI must fail on violations).

## Rationale

- Strict typing provides better guarantees for correctness and refactoring safety.
- Allowing `any` makes the type system optional; it becomes a debt multiplier in shared boilerplate.

## Consequences

- Some integrations require deliberate parsing/narrowing (`unknown` + validation).
- Developers must model types more explicitly (DTOs, unions, typed ports).

## Alternatives Considered

- “Strict but allow `any`”: rejected (degrades quickly in real teams).
- “Not strict, rely on tests”: rejected (tests cannot cover all type-related defects and refactor regressions).

## Links / References

- `docs/standards/code-quality.md`

