# Canonical Harness Foundation

Date: 2026-08-09
Owner: repository owner and implementing agent
Status: completed
Risk class: high
Related issue/PR: N/A

## Objective

Introduce Phase 1 of the accepted backend loop-engineering direction: one safe
process boundary, typed verification profiles, a thin repository-local
`backendkit` CLI, focused profile tests, and local/hosted CI semantic parity.

## Constraints

- Architecture constraints: harness tooling stays outside production
  `apps/`/`libs/` runtime and reuses existing sensors instead of absorbing them.
- Product/runtime constraints: no API, worker, database schema, queue, auth, or
  application behavior changes.
- Out of scope: task state, risk classification, agent execution, bounded
  repair, event triggers, publication, and hill climbing belong to later phases.
- Compatibility: preserve existing public npm verification aliases.
- Safety: subprocesses use structured arguments with `shell: false` except the
  explicit Windows npm launcher boundary.

## Impact Areas

- API/OpenAPI: no
- DB/Prisma/migrations: no
- Auth/session/RBAC: no
- Queue/jobs: no
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: no
- CI/release/harness: yes

## Acceptance Criteria

1. `backendkit verify --profile fast|full|runtime|ci` resolves typed, tested
   profiles and fails fast with a stable non-zero outcome.
2. Existing `verify`, `verify:ci-local`, and `verify:e2e` npm aliases route
   through the same profile owner.
3. Hosted CI invokes the canonical `ci` profile rather than duplicating its
   verification steps.
4. The process runner never enables a shell for ordinary commands and handles
   output, non-zero exits, signals, and timeouts predictably.
5. Profile, CLI, process, and parity tests pass under the canonical repository
   test command.
6. Existing backend sensors and runtime cleanup behavior remain intact.

## Implementation Checklist

- [x] Add ADR for canonical repository-local harness orchestration.
- [x] Add safe process runner and npm invocation helper.
- [x] Add typed profile registry and profile runner.
- [x] Add thin `backendkit` CLI and usage contract.
- [x] Route npm compatibility aliases through profiles.
- [x] Route hosted CI through the canonical `ci` profile.
- [x] Refactor runtime orchestration to use the safe process runner.
- [x] Add focused unit and semantic parity tests.
- [x] Update harness and PR-loop documentation.
- [x] Run targeted and full verification.

## Decision Log

- 2026-08-09: Keep profile policy in typed TypeScript so profile expansion and
  command selection can be checked by the compiler and fixture tests.
- 2026-08-09: Keep existing sensors in place and expose them as registered npm
  steps; Phase 1 changes orchestration ownership, not sensor behavior.
- 2026-08-09: Define `ci` as `full` followed by `runtime`, while
  `verify:ci-local` remains the non-Docker `full` compatibility alias.
- 2026-08-09: Preserve existing Compose host ports as defaults but allow
  explicit host-port overrides so runtime verification does not require
  stopping an unrelated local stack.

## Verification

- Focused harness tests: 5 suites and 19 tests passed.
- Canonical fast profile (`npm run verify`): 59 suites and 292 tests passed;
  formatting, lint, type checking, env, dependency boundaries, OpenAPI drift,
  and Spectral checks passed.
- Canonical full profile (`npm run verify:ci-local`): Prisma drift, formatting,
  lint, type checking, env, project map, dependency boundaries, scaffold,
  architecture smells, duplication, coverage, OpenAPI, gate honesty, and
  production dependency audit passed. Coverage was 49.02% statements, 42.82%
  branches, 44.43% functions, and 50.64% lines; the audit found 0
  vulnerabilities.
- Final repository checks passed: `npm run format:check`, `npm run lint`,
  `npm run typecheck`, `npm test` (59 suites and 292 tests),
  `npm run deps:check`, `npm run verify:project-map`, and `git diff --check`.

## Runtime Evidence

The canonical runtime profile passed against a fresh, isolated Compose project
and database using explicit local host-port overrides. All 15 migrations
applied, migration status was current, 6 integration suites/25 tests passed,
and 5 E2E suites/61 tests passed. The profile removed its containers and
network in `finally`; the remaining test-only volumes were then explicitly
removed and their absence verified. No unrelated local containers or existing
project volumes were stopped or deleted.

## Risks And Mitigations

- Risk: alias recursion or profile cycles. Mitigation: explicit internal runtime
  sensor alias plus profile expansion tests and cycle detection.
- Risk: local/CI drift returns. Mitigation: a parity test checks npm aliases and
  hosted workflow ownership.
- Risk: runtime dependencies remain running after failure. Mitigation: preserve
  `finally` cleanup and test/execute the runtime profile.
- Risk: CLI abstraction becomes a second script collection. Mitigation: keep
  command routing thin and keep sensor policy with existing owners.

## Completion Notes

Phase 1 is complete. Verification policy now has one typed profile registry and
one safe process boundary. Existing npm entry points remain compatible, hosted
CI delegates to the same `ci` composition, and existing sensors remain the
owners of their domain checks.

## Follow-Ups

- [ ] Create the Phase 2 structured task-control execution plan only after this
      phase is verified and reviewed.
