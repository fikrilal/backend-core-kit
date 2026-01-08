# Code Quality Standard

This document defines the minimum code quality bar for the core kit and all projects built from it.

This is not “style preference”. These rules exist to reduce production defects, speed up reviews, and keep the codebase maintainable over years.

## Non-Negotiables

- TypeScript **strict mode** is enabled.
- `any` is **forbidden** (no `any`, no `as any`, no implicit `any`).
- Architectural boundaries are **automatically enforced** in CI (no “trust review” for layering).
- Formatting is automated (Prettier) and never debated in PRs.

See ADRs:
- `docs/adr/0013-typescript-strict-no-any.md`
- `docs/adr/0014-enforce-architecture-boundaries.md`

## TypeScript Rules

### Strictness

Required compiler posture:
- `strict: true` (includes `noImplicitAny`)

Recommended additional flags (adopt early if possible):
- `useUnknownInCatchVariables: true`
- `noFallthroughCasesInSwitch: true`
- `noImplicitOverride: true`

### No `any` Policy

Rules:
- Do not use `any` in source code.
- Do not “escape hatch” with `as any` or `// eslint-disable` to bypass typing.
- Use `unknown` for untrusted values, then narrow/parse.

Acceptable alternatives:
- `unknown` + runtime validation (DTO validation or schema parsing)
- discriminated unions
- generics with constraints
- explicit DTOs / interfaces

### Type Assertions

Rules:
- Prefer narrowing via guards over `as`.
- Assertions must be local and justified by an invariant (e.g., “we already validated DTO at boundary”).
- Never assert across trust boundaries (e.g., request body, webhook payload, job payload, external API response) without validation.

### Null/Undefined Discipline

Rules:
- Avoid nullable/optional values in “core” domain types. Prefer explicit variants.
- When values may be missing, model it explicitly and handle it deliberately.

## Linting & Formatting

### ESLint (Type-Aware)

Linting should be type-aware and treated as a correctness tool, not a style tool.

Required categories:
- no unused vars/imports
- no floating promises
- correct promise usage in async contexts
- no implicit `any` / no explicit `any`
- consistent type-only imports
- no `console.*` (use structured logger)

Rule posture:
- Prefer `error` for correctness/safety rules.
- Avoid “warning debt” (warnings ignored become permanent).

### Prettier

Prettier is the formatting source of truth:
- run via `npm run format`
- enforced in CI (format check)

Do not bike-shed formatting in reviews.

## Architectural Boundaries (Hard Requirement)

The core kit architecture is only valuable if enforced.

### Layering Rule

Within a feature:

```text
infra  -> app  -> domain
```

Rules:
- `domain` must not import `app`, `infra`, or `platform`.
- `app` must not import `infra` or Nest/Prisma/Redis/BullMQ.
- `infra` may import `app`, `domain`, and `platform` adapters as needed.

### Package Rule

Top-level structure:
- `apps/*` are process bootstraps (API/worker).
- `libs/platform/*` is cross-cutting infrastructure.
- `libs/features/*` are vertical slices.

Rules:
- `libs/platform/*` must not depend on `libs/features/*` (platform must stay reusable).
- `apps/api/*` and `apps/worker/*` may depend on `libs/platform/*` and `libs/features/*`.

### Enforcing Boundaries (Automated)

Boundaries must be enforced by an automated tool in CI (not just review).

Baseline expectation:
- detect forbidden imports (layer violations)
- detect circular dependencies
- fail CI on violations

See ADR: boundary enforcement tool + config will be codified and versioned with the repo.

## Dependency Injection & Instantiation

Rules:
- Do not instantiate services inside other services/controllers with `new`.
- Use Nest DI for infra/http wiring and platform integrations.
- Keep constructors side-effect free (no network calls, no DB queries).

Rationale:
- testability
- consistent lifecycle control
- avoids hidden coupling

## Error Handling Discipline

Rules:
- Use the standardized error model (problem-details + stable `code`).
- Do not throw raw strings.
- Do not leak internal details in error responses.

See:
- `docs/standards/api-response-standard.md`
- `docs/standards/error-codes.md`

## Logging Discipline

Rules:
- Use structured logging only.
- No secrets in logs, ever.
- Prefer IDs and correlation fields over raw user data.

See:
- `docs/standards/observability.md`
- `docs/standards/security.md`
