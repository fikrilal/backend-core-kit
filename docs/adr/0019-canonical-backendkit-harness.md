# ADR: Canonical Repository-Local Harness Through `backendkit`

- Status: Accepted
- Date: 2026-08-09
- Decision makers: Core kit maintainer

## Context

The repository has strong backend-specific sensors, but verification
orchestration is duplicated across `package.json`,
`scripts/verify-ci-local.ts`, `scripts/verify-e2e.ts`, and hosted CI. The public
commands do not all mean the same thing locally and in CI, and orchestration
code has no single tested owner.

The accepted loop-engineering direction requires a stable foundation before
task state, agent execution, repair, events, or evidence can be added.

## Decision

Use a repository-local TypeScript CLI named `backendkit` as the canonical
harness command surface.

- A typed registry owns the `fast`, `full`, `runtime`, and `ci` verification
  profile definitions.
- One safe process runner owns structured subprocess execution.
- Existing backend sensors remain independent commands invoked by profiles.
- Existing public npm commands remain compatibility aliases to `backendkit`.
- Hosted CI invokes the same canonical profiles used locally.
- Harness tooling lives under `tools/backendkit/` and is not imported by
  production application code.

## Rationale

- One orchestration owner prevents local/CI semantic drift.
- Typed profiles and fixture tests make harness policy reviewable as software.
- A thin CLI improves discoverability without moving every sensor into one
  framework.
- Compatibility aliases avoid a disruptive command migration.
- The boundary creates a small foundation for later loop-engineering phases.

## Consequences

- Harness code becomes part of lint, typecheck, and unit-test scope.
- CI output is grouped by canonical profile steps rather than duplicated YAML
  steps.
- Profile changes are high-risk harness changes and require corresponding tests
  and documentation.
- Existing standalone sensor scripts remain supported and may be consolidated
  only through later focused work.

## Alternatives Considered

- Keep orchestration in package scripts and workflow YAML: rejected because
  semantic drift already exists and cannot be tested cleanly.
- Port the frontend harness wholesale: rejected because it includes later task
  control and evidence behavior not required by Phase 1.
- Copy the mobile CLI package shape and scope: rejected because the backend
  needs a much smaller repository-local command surface.
- Introduce a general workflow framework: rejected because built-in Node APIs
  and the existing scripts are sufficient.

## Links / References

- `_WIP/2026-08-09_backend-harness-engineering-audit.md`
- `_WIP/2026-08-09_backend-loop-engineering-proposal.md`
- `docs/engineering/guardrails.md`
- `docs/engineering/agent-pr-loop.md`
- `docs/exec-plans/active/2026-08-09_canonical-harness-foundation.md`
