# Controlled Harness Hill Climbing

**Plan version:** 2
**Task ID:** controlled-hill-climbing-20260810
**Status:** completed
**Owner:** Dante and Codex
**Risk:** high
**Authority:** implement and verify Phase 8 advisory analysis and policy validation locally; no hypothesis activation, policy rollout, evidence promotion, commit, push, PR, merge, deployment, migration, or external mutation
**Allowed paths:** _WIP/2026-08-09_backend-loop-engineering-proposal.md, docs/adr/0026-controlled-harness-hill-climbing.md, docs/adr/README.md, docs/engineering/backendkit-cli.md, docs/engineering/controlled-hill-climbing.md, docs/engineering/guardrails.md, docs/engineering/harness-improvement-ledger.json, docs/engineering/operating-evidence.md, docs/exec-plans/README.md, docs/exec-plans/active/2026-08-10_controlled-hill-climbing.md, docs/exec-plans/completed/2026-08-10_controlled-hill-climbing.md, tools/backendkit/
**Allowed actions:** edit, verify
**Maximum risk:** high
**Repair limit:** 2
**Task timeout:** 6h

Date: 2026-08-10
Related issue/PR: N/A

## Objective

Implement Phase 8 as a deterministic advisory layer over independently reviewed
operating evidence: aggregate stable trends, validate falsifiable improvement
hypotheses and immutable invariants, evaluate later evidence in shadow mode, and
record human keep/revert decisions without autonomously creating tasks,
changing policy, rolling out code, or publishing work.

## Constraints

- The current evidence ledger is below eligibility; the improvement ledger must
  remain empty and all recommendation/evaluation commands must report disabled.
- Only the reviewed operating ledger may drive trends; raw episodes,
  diagnostics, prompts, and model output are never inputs.
- Trend analysis is deterministic aggregation, not LLM judgment.
- A hypothesis must identify a recurring stable pattern, target component,
  measurable rate, minimum predicted improvement, evaluation window, immutable
  invariants, rollback unit, human owner, and baseline task IDs.
- Approved/evaluating hypotheses require explicit human approval and a separate
  high-risk harness execution plan. This phase does not approve one.
- Shadow evaluation changes no policy. It compares later reviewed evidence and
  returns `keep`, `revert`, or `inconclusive` advice only.
- Terminal keep/revert decisions require human identity and structured observed
  results. The controller cannot authenticate the person; normal source review
  remains the authority boundary.
- No command may edit the improvement ledger, create an execution plan, modify
  harness policy, or publish a change.

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

1. Trend aggregation reports reviewed task counts, risk diversity, repair/
   escalation rates, and recurring stable stop reasons from sanitized entries.
2. With the current empty evidence ledger, improvement validation passes only
   for an empty ledger and analysis reports hill climbing disabled.
3. Strict hypothesis parsing rejects unknown fields, unstable IDs, missing
   recurring patterns, weak predictions, incomplete immutable invariants,
   unsafe rollback paths, agent approval identities, and inconsistent status.
4. Approved/evaluating hypotheses require a separate high-risk V2 harness plan
   limited to edit/verify authority; external publication actions are invalid.
5. Shadow evaluation uses later reviewed tasks only, respects the declared
   window, and deterministically returns keep/revert/inconclusive without writes.
6. Terminal entries require a human keep/revert decision consistent with the
   observed shadow result and preserve a file-granular rollback unit.
7. CLI, ADR, guardrail, evidence, execution-plan, and proposal docs explain that
   Phase 8 is implemented but operationally disabled until evidence eligibility.

## Implementation Checklist

- [x] Add deterministic operating-evidence trend aggregation.
- [x] Add strict improvement hypothesis and lifecycle ledger schemas.
- [x] Add isolated high-risk execution-plan validation.
- [x] Add read-only shadow evaluation and keep/revert recommendations.
- [x] Add read-only CLI check/analyze/shadow commands and negative fixtures.
- [x] Update ADR and operating documentation.
- [x] Run focused and canonical full verification.

## Decision Log

- 2026-08-10: Keep all Phase 8 commands read-only -> source review and explicit
  plans remain the only mutation and rollout authority.
- 2026-08-10: Reject any hypothesis while evidence is ineligible -> do not
  fabricate trends or prematurely optimize the harness.
- 2026-08-10: Limit initial metrics to repair and escalation rates -> both are
  reconstructable from the sanitized ledger without subjective scoring.
- 2026-08-10: Require all immutable invariants in every hypothesis -> a proposed
  improvement cannot trade safety for apparent task success.
- 2026-08-10: Require rollback units to identify files, not directories -> the
  promised file-granular reversal boundary is mechanically enforced.

## Verification

- `npx tsc --noEmit --pretty false`: passed.
- `npx eslint tools/backendkit/cli.ts tools/backendkit/command.ts tools/backendkit/command.spec.ts tools/backendkit/improvement/*.ts`: passed.
- Focused Jest run for command and improvement modules: 4 suites and 19 tests passed.
- Final rollback-boundary regression run: 3 suites and 15 tests passed.
- `npx jest --runInBand tools/backendkit`: 29 suites and 142 tests passed.
- `npm run backendkit -- task preflight --task controlled-hill-climbing-20260810 --action verify`: passed with high effective risk, 17 task-owned paths, and 3 controller artifacts.
- `npm run backendkit -- task verify --task controlled-hill-climbing-20260810`: passed canonical `full` profile on attempt 1.
- `npm run verify:ci-local`: passed the final source after tightening the
  file-granular rollback validator; 83 suites and 415 tests passed, with zero
  production dependency vulnerabilities.
- `npm run backendkit -- improve check`: passed with zero hypotheses and correctly reported disabled by the evidence threshold.
- `npm run backendkit -- improve analyze`: reported zero reviewed tasks and hill climbing disabled.
- `npm run backendkit -- improve shadow --hypothesis unavailable`: reported shadow evaluation disabled by the evidence threshold.
- `git diff --check`: passed before plan closure.

## Runtime Evidence

- Environment: local repository and pure in-memory evidence fixtures.
- Dependencies/services: Node.js toolchain only.
- Executed request/job/flow: read-only improvement check, trend analysis, disabled shadow evaluation, and canonical task verification.
- Artifact path(s): `.tmp/backendkit/tasks/controlled-hill-climbing-20260810/episodes/attempt-1.json`.
- Relevant log/trace/request IDs: N/A.
- Notes: no real hypothesis or rollout is authorized by this plan.

## Risks And Mitigations

- Risk: noise is mistaken for a recurring pattern.
  Mitigation: eligibility plus minimum affected-task and evaluation-window rules.
- Risk: the harness optimizes its own grader.
  Mitigation: immutable invariants, independent reviewed evidence, shadow mode,
  and human keep/revert decisions.
- Risk: advisory tooling silently changes policy.
  Mitigation: read-only CLI and no source-writing adapter.
- Risk: rollback is vague or broad.
  Mitigation: exact canonical file paths and separate high-risk execution plans.

## Completion Notes

- Added deterministic trend analysis over reviewed, sanitized operating evidence.
- Added a strict improvement ledger with immutable invariants, human ownership,
  isolated plan validation, deterministic shadow evaluation, and terminal
  decision consistency checks.
- Added read-only `improve check`, `improve analyze`, and `improve shadow`
  commands. None can mutate policy, evidence, plans, or source files.
- Kept the improvement ledger empty and every advisory flow disabled because
  the Phase 7 operating-evidence threshold has not yet been met.
- An attempted canonical npm alias was rejected by task preflight because
  `package.json` was outside this plan's authority. The optional wiring was
  removed; the scoped CLI remains available through `backendkit`.

## Follow-Ups

- [ ] Populate the ledger only after five real tasks satisfy Phase 7 review.
- [ ] Add unresolved debt to `docs/exec-plans/tech-debt-tracker.md`.
