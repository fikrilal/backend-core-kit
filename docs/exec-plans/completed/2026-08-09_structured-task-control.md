# Structured Task Control

**Plan version:** 2
**Task ID:** structured-task-control-20260809
**Status:** completed
**Owner:** repository owner and implementing agent
**Risk:** high
**Authority:** implement and verify Phase 2 locally; no external mutation
**Allowed paths:** tools/backendkit/, docs/README.md, docs/adr/, docs/engineering/, docs/exec-plans/, docs/guide/development-workflow.md, docs/standards/ci-cd.md, package.json
**Allowed actions:** edit, verify
**Maximum risk:** high
**Repair limit:** 2
**Task timeout:** 120m

## Objective

Implement Phase 2 of the accepted loop-engineering proposal: a validated V2
execution-plan contract, conservative changed-path risk classification,
pre-existing-change ownership, atomic local task state, task preflight, and
knowledge lifecycle checks.

## Constraints

- Keep task control in `tools/backendkit/`; production applications and
  libraries must not import harness tooling.
- Authority comes only from the human-approved plan. Parsing plans or observing
  repository changes must never expand authority or lower risk.
- Persist state only under ignored `.tmp/backendkit/`; do not add a database or
  application runtime dependency.
- Preserve Phase 1 verification profiles and npm compatibility aliases.
- Risk-aware profile selection, repair attempts, evidence episodes, worktree
  creation, agent execution, and publication are out of scope for Phase 2.

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

1. V2 plans reject missing, duplicate, broad, absolute, traversal, globbed, or
   unsupported authority metadata before task state is created.
2. `backendkit task begin --plan <path>` captures the base revision, immutable
   authority fingerprint, declared boundaries, and path-level pre-existing
   changes through an atomic ignored state file.
3. `backendkit task preflight` rejects unauthorized actions, task-owned paths
   outside scope, changed authority metadata, invalid state, and effective risk
   above the approved maximum before expensive verification.
4. Changed-path classification may raise declared risk but never lower it;
   unknown executable paths default to medium and security-sensitive backend,
   dependency, CI, and harness paths classify high.
5. `backendkit knowledge check` validates V2 plan lifecycle, required metadata,
   required sections, status/folder consistency, active-task uniqueness, task-ID
   uniqueness, and completed implementation checklists while grandfathering
   existing legacy completed plans.
6. Pure policy and state behavior have negative fixture coverage, and canonical
   repository verification remains green.

## Implementation Checklist

- [x] Record the task-controller authority and persistence decision in an ADR.
- [x] Implement V2 metadata and boundary parsing.
- [x] Implement conservative backend changed-path risk policy.
- [x] Implement injectable Git change discovery and path content fingerprints.
- [x] Implement validated atomic task-state storage and task begin.
- [x] Implement action, plan-integrity, scope, and risk preflight.
- [x] Implement knowledge lifecycle validation.
- [x] Expose thin task, risk, and knowledge CLI commands.
- [x] Add focused unit and repository parity tests.
- [x] Update execution-plan templates and harness documentation.
- [x] Run targeted, full, and applicable runtime verification.

## Decision Log

- 2026-08-09: Store schema-versioned state under `.tmp/backendkit/tasks/` ->
  state is local controller data, already ignored, and does not justify a
  service dependency.
- 2026-08-09: Track pre-existing ownership by path plus content fingerprint ->
  this detects later edits to dirty user paths while remaining much simpler
  than line-level ownership; isolated worktrees remain Phase 4.
- 2026-08-09: Enforce V2 for active and queued plans, but grandfather legacy
  completed plans -> historical documents remain readable without a noisy
  repository-wide migration.
- 2026-08-09: Keep risk rules in typed TypeScript -> stable rule IDs and policy
  outcomes are compiler-checked and directly fixture-tested.

## Verification

- Focused harness suite: 10 suites and 47 tests passed after the final
  controller-artifact policy fixture was added.
- Canonical fast profile (`npm run verify`): knowledge, formatting, lint,
  typecheck, env, dependency boundaries, 64 suites/320 tests, OpenAPI drift,
  and Spectral lint passed.
- Canonical full profile (`npm run verify:ci-local`): knowledge, Prisma drift,
  formatting, lint, typecheck, env, project map, dependency boundaries,
  scaffold smoke, architecture smells, duplication reports, coverage, OpenAPI,
  gate honesty, and production audit passed. The run completed with 64 suites
  and 319 tests before the final one-test artifact fixture; production audit
  found 0 vulnerabilities.
- Final targeted checks passed: `npm run typecheck`, `npm run lint`,
  `npm run verify:knowledge`, `npm run verify:project-map`, and
  `git diff --check`.

## Runtime Evidence

The real repository CLI created task state with
`backendkit task begin --plan docs/exec-plans/active/2026-08-09_structured-task-control.md`,
capturing base revision `3e69139d2e86f9dfd398e3daa174ac80a171453b`
and 33 pre-existing paths. A post-baseline preflight identified exactly two
task-owned paths. After the full profile rewrote timestamped local reports,
preflight correctly rejected the three out-of-scope paths; the integration was
then made explicit by classifying only those exact untracked report paths as
controller artifacts. Final preflight passed at high effective risk with seven
task-owned paths and three reported controller artifacts.

Docker-backed application verification was not run: Phase 2 changes no API,
database, Redis, queue, storage, migration, or application runtime behavior.
The applicable runtime evidence is the real Git repository begin/preflight
flow plus the canonical full profile.

## Risks And Mitigations

- Risk: plan parsing accidentally grants broad scope. Mitigation: reject roots,
  traversal, globs, whitespace ambiguity, duplicates, and symlink escapes.
- Risk: pre-existing dirty work is attributed to the task. Mitigation: record
  status and content fingerprints at begin; later content changes become
  task-owned.
- Risk: policy makes old documentation invalid. Mitigation: enforce the V2
  lifecycle prospectively and grandfather only legacy completed plans.
- Risk: Phase 2 grows into a workflow engine. Mitigation: stop at validated
  state and report-only preflight; defer execution and repair controllers.

## Completion Notes

Phase 2 is complete. New tasks have a prospective V2 plan contract, local
atomic baseline state, explicit path/action authority, conservative risk
raising, pre-existing path ownership, knowledge lifecycle validation, and a
preflight command that covers committed plus dirty changes. Risk-aware profile
selection, repair, evidence episodes, worktree isolation, and agent execution
remain deliberately deferred.

## Follow-Ups

- [ ] Create the Phase 3 risk-aware verification and bounded-repair execution
      plan only after this phase is verified and reviewed.
