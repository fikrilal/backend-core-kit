# Verified Handoff And Independent CI

**Plan version:** 2
**Task ID:** verified-handoff-independent-ci-20260810
**Status:** completed
**Owner:** Dante and Codex
**Risk:** high
**Authority:** implement and verify Phase 6 locally; no real commit, push, PR, merge, deployment, migration, or hosted workflow execution
**Allowed paths:** _WIP/2026-08-09_backend-loop-engineering-proposal.md, .github/workflows/, docs/adr/0024-verified-handoff-independent-ci.md, docs/adr/README.md, docs/engineering/agent-pr-loop.md, docs/engineering/backend-runtime-evidence.md, docs/engineering/backendkit-cli.md, docs/engineering/guardrails.md, docs/exec-plans/README.md, docs/exec-plans/active/2026-08-10_verified-handoff-independent-ci.md, docs/exec-plans/completed/2026-08-10_verified-handoff-independent-ci.md, docs/guide/development-workflow.md, docs/standards/ci-cd.md, tools/backendkit/
**Allowed actions:** edit, verify
**Maximum risk:** high
**Repair limit:** 2
**Task timeout:** 6h

Date: 2026-08-10
Related issue/PR: N/A

## Objective

Implement Phase 6 with a sanitized dry-run handoff, fresh-evidence validation,
separately approved commit/push/draft-PR adapters, clean-checkout CI risk/full/
runtime/aggregate jobs, immutable third-party action pins, and reproducible
hosted evidence boundaries.

## Constraints

- `ready_for_review` is evidence, never publication authority.
- Every mutating publication action requires plan authority plus a fresh,
  expiring, one-action approval created after dry-run review.
- The repository cannot authenticate the human speaker; the operating contract
  still requires explicit user authorization before the current agent invokes
  approval or mutation commands.
- Revalidate task fingerprint, successful episode, workspace identity, branch,
  remote, ownership, staged paths, and action authority immediately before each
  mutation.
- Stage explicit task-owned paths only; never stage user-owned or controller
  artifacts and never use broad `git add` forms.
- Commit is one normal commit; push is normal non-force push; PR creation is
  draft-only with explicit head/base/title/body.
- Merge, deploy, migration, force push, branch deletion, and PR-ready operations
  remain unavailable.
- Publication interruption with an uncertain external outcome must fail closed
  and require human reconciliation.
- Hosted CI must verify a clean checkout independently and must not trust local
  task episodes as pass evidence.
- Keep existing npm profile aliases canonical; workflow YAML may select profiles
  but must not duplicate their internal steps.

## Impact Areas

- API/OpenAPI: no
- DB/Prisma/migrations: no
- Auth/session/RBAC: no
- Queue/jobs: no
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: yes
- CI/release/harness: yes

## Acceptance Criteria

1. Dry-run handoff succeeds only for `ready_for_review` work whose latest
   successful episode fingerprint exactly matches current task content.
2. Dry-run output is sanitized and identifies exact task paths, branch, remote,
   verification attempt, action, and expiring approval challenge.
3. Commit, push, and draft-PR adapters each require their own approved action,
   revalidate freshness immediately, and expose no force/merge/deploy behavior.
4. Interrupted or conflicting publication state is never automatically retried
   when the external outcome is uncertain.
5. CI risk classification uses the clean base/head diff plus changed V2 plan
   declarations and conservatively selects runtime evidence.
6. Hosted CI has separate risk, full, conditional runtime, governance, and
   stable aggregate checks with least privilege, timeouts, concurrency control,
   clean dependency teardown, and immutable action SHAs.
7. Hosted artifacts contain coverage or approved runtime evidence only; raw
   diagnostics, environment values, credentials, and model output are excluded.

## Implementation Checklist

- [x] Add episode reading and ready-for-review freshness inspection.
- [x] Add strict handoff approval state and sanitized dry-run rendering.
- [x] Add separately approved commit, push, and draft-PR adapters with negative fixtures.
- [x] Add clean-diff CI classification and focused tests.
- [x] Split and harden hosted CI/governance workflows with immutable action SHAs.
- [x] Update ADR, workflow, CLI, guardrail, CI, evidence, and proposal docs.
- [x] Run focused, full, and applicable runtime verification.

## Decision Log

- 2026-08-10: Require a fresh successful episode plus a recomputed fingerprint
  -> task status alone cannot prove that verification still covers current
  content.
- 2026-08-10: Use expiring one-action approvals prepared by dry-run -> commit,
  push, and draft PR remain independently authorized and auditable.
- 2026-08-10: Mark mutation state executing before external action -> uncertain
  interruption fails closed instead of replaying a possibly completed action.
- 2026-08-10: Keep CI profile internals in `backendkit` -> hosted and local
  verification remain semantically identical.
- 2026-08-10: Keep existing action majors and pin current patch releases to
  verified upstream full SHAs -> immutable supply-chain identity without an
  unrelated major migration.

## Verification

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- Focused Jest command for `tools/backendkit/ci`, `handoff`, CLI, episode,
  task-service, and profile-parity suites — 9 suites and 37 tests passed.
- `npm run verify:project-map` — passed; 120 links/items checked.
- `npm run verify:ci-local` — passed; 78 suites and 374 tests passed with
  coverage, OpenAPI, gate-honesty, dependency boundaries, and production audit.
- Default `npm run verify:e2e` attempt — failed closed because host port 54321
  was already allocated; dependency teardown passed.
- Alternate-port `npm run verify:e2e` against the pre-existing default Compose
  volume — exposed unrelated local schema drift (`UserProfile.givenName` was
  absent); dependency teardown passed and the existing volume was preserved.
- Isolated `COMPOSE_PROJECT_NAME=backendkitphase6verify npm run verify:e2e` with
  alternate host ports and matching test URLs — passed; 15 migrations applied,
  6 integration suites/25 tests passed, 5 E2E suites/61 tests passed, and
  dependency teardown passed.
- `git diff --check` — passed.

## Runtime Evidence

- Environment: local repository and temporary Git/process fixtures.
- Dependencies/services: git, Node.js toolchain, and Docker only if selected by
  canonical risk policy.
- Executed request/job/flow: real temporary Git exact-path commit fixture;
  clean Compose migration, integration, E2E, and teardown flow.
- Artifact path(s): local coverage under `coverage/`; private test fixtures were
  removed; no controller diagnostics were uploaded.
- Relevant log/trace/request IDs: N/A.
- Notes: no real publication or hosted workflow execution was performed. The
  three isolated Compose volumes were explicitly removed after teardown. The
  pre-existing default Compose volume was not changed or deleted.

## Risks And Mitigations

- Risk: stale verification is published.
  Mitigation: compare latest successful episode fingerprint with a fresh
  handoff preflight immediately before every action.
- Risk: broad staging includes unrelated user files.
  Mitigation: isolated workspace identity plus explicit task-path staging and
  staged-set equality checks.
- Risk: retry duplicates a commit, push, or PR after interruption.
  Mitigation: persist executing state before mutation and refuse automatic
  recovery of uncertain outcomes.
- Risk: CI runtime is incorrectly skipped.
  Mitigation: combine conservative path rules with all changed V2 plan impacts
  and risk declarations, then test negative fixtures.
- Risk: third-party workflow tags move.
  Mitigation: full-length upstream action SHAs with reviewed release comments.

## Completion Notes

- Added fresh episode reads and a handoff-only preflight boundary for verified
  `ready_for_review` tasks.
- Added strict expiring action approvals and narrow normal commit, non-force
  push, and draft-only PR adapters with uncertain-outcome lockout.
- Added clean-diff CI classification and independent risk/full/runtime/
  governance/required workflow jobs with immutable action pins.
- Recorded the authority and CI decisions in ADR 0024 and updated the operating
  docs and accepted proposal through Phase 6.
- No source publication action was invoked; all implementation remains
  uncommitted for review.

## Follow-Ups

- [ ] Add update-draft-PR only after create behavior has operating evidence.
- [ ] Add unresolved debt to `docs/exec-plans/tech-debt-tracker.md`.
