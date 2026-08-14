# Risk-Aware Verification And Bounded Repair

**Plan version:** 2
**Task ID:** risk-aware-verification-repair-20260809
**Status:** completed
**Owner:** repository owner and implementing agent
**Risk:** high
**Authority:** implement and verify Phase 3 locally; no external mutation
**Allowed paths:** tools/backendkit/, docs/adr/, docs/engineering/, docs/exec-plans/, docs/guide/development-workflow.md, docs/standards/ci-cd.md, package.json
**Allowed actions:** edit, verify
**Maximum risk:** high
**Repair limit:** 2
**Task timeout:** 120m

Date: 2026-08-09
Related issue/PR: N/A

## Objective

Implement Phase 3 of the accepted loop-engineering proposal: risk-derived
verification lanes, stable failure categories, meaningful task fingerprints,
bounded repair decisions, redacted transient diagnostics, and sanitized task
episode output through `backendkit task verify`.

## Constraints

- Human-approved V2 task boundaries remain the only authority source.
- Verification may move controller state but cannot edit task scope, lower risk,
  weaken sensors, change baselines, or grant publication actions.
- Reuse the canonical Phase 1 profiles and Phase 2 preflight; do not duplicate
  sensor definitions.
- Persist only schema-validated local state, bounded diagnostics, and sanitized
  metadata under ignored `.tmp/backendkit/tasks/`.
- Worktree ownership, agent execution, cancellation/resume, events, and
  publication remain out of scope until later phases.

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

1. `backendkit task verify --task <id>` runs Phase 2 preflight first and selects
   `fast` for low risk, `full` for medium/high risk, and `runtime` only for
   declared or changed-path runtime impact.
2. Every failed profile step maps to a stable failure code and writes only
   redacted, size-bounded task-local diagnostics; raw output and environment
   values never enter durable state or episodes.
3. Fingerprints include immutable plan authority, effective risk, task-owned
   paths and content, and the failed boundary. Repeating the same failure
   without meaningful change consumes the repair budget deterministically.
4. Successful required lanes move state to `ready_for_review`; repairable
   failures move it to `repairing`; exhausted budget, timeout, scope, authority,
   or risk failures stop deterministically without weakening policy.
5. Each attempt writes a schema-versioned sanitized episode containing only
   approved identifiers, paths, hashes, risk reasons, lane outcomes, timings,
   transitions, and stop category.
6. State V1 baselines remain readable and are upgraded safely when Phase 3
   verification first writes them.
7. Negative fixtures prove lane selection, redaction, schema rejection,
   meaningful-progress reset, budget exhaustion, and successful completion.

## Implementation Checklist

- [x] Add runtime-impact classification and deterministic lane selection.
- [x] Add stable verification failure taxonomy and remediation metadata.
- [x] Extend task state with attempts, transitions, and failure records.
- [x] Add task fingerprints from path content and effective risk.
- [x] Add bounded redacted transient diagnostic storage.
- [x] Add sanitized episode schema and atomic writer.
- [x] Implement verification orchestration and repair-budget decisions.
- [x] Expose `backendkit task verify --task <id>` through the thin CLI.
- [x] Add focused policy, state, diagnostics, episode, and controller tests.
- [x] Update ADRs, CLI/workflow/guardrail documentation, and plan guidance.
- [x] Run task preflight, targeted tests, fast/full profiles, and applicable
      runtime verification.

## Decision Log

- 2026-08-09: A rerun in `repairing` state is the Phase 3 repair mechanism ->
  the actual repair actor remains human until the Phase 4 agent runtime exists.
- 2026-08-09: Keep diagnostics local, redacted, and capped per attempt -> raw
  verification output is useful transiently but unsafe as durable evidence.
- 2026-08-09: Count the initial failure plus up to `Repair limit` unchanged
  repair failures before escalation -> the configured number describes repair
  opportunities, not total verification attempts.
- 2026-08-09: Select runtime from explicit impact plus conservative path rules ->
  risk alone chooses static depth and does not make every high-risk harness task
  start Docker dependencies.

## Verification

- Focused harness suite: 14 suites and 62 tests passed.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and
  `npm run verify:knowledge` passed during implementation.
- Live Phase 2 preflight passed at high effective risk with 30 task-owned paths
  and three explicit controller artifacts before controller verification.
- The real task-verification flow selected only `full` and passed every
  canonical non-Docker sensor in 119.3 seconds for task
  `risk-aware-verification-repair-20260809`.
- Full-profile coverage remained 49.02% statements, 42.82% branches, 44.43%
  functions, and 50.64% lines. The production dependency audit passed with no
  reported vulnerability.
- After the completed-plan transition, `npm run verify` passed with 68 suites
  and 335 tests. Project-map drift, knowledge lifecycle, formatting, and diff
  checks also passed.

## Runtime Evidence

The task began from base revision
`91b56edc4f1453df230dbf34bcebf399f14543a0` with six pre-existing paths. The
real controller upgraded its V1 baseline to state schema V2 and authority
schema V2, recorded attempt 1, selected `full`, and transitioned through
`verifying` to `ready_for_review` with zero failures.

The sanitized episode is stored locally at
`.tmp/backendkit/tasks/risk-aware-verification-repair-20260809/episodes/attempt-1.json`.
It records high effective risk, human review required, 30 changed paths, one
passed full lane, no runtime reasons, and stop reason `verification.passed`.
State and episode files are mode `0600`; a forbidden-field scan found no raw
output, environment URL, bearer, cookie, private-key, prompt, or reasoning
field.

Docker-backed runtime was correctly not selected because this high-risk task
declared only CI/release/harness impact and changed no runtime-sensitive path.
Failure, repair, exhaustion, meaningful-progress reset, timeout, diagnostics,
and episode behavior were exercised through deterministic controller fixtures.

## Risks And Mitigations

- Risk: diagnostics retain credentials or PII. Mitigation: redact known secret
  forms before a strict byte cap; test representative JWT, bearer, URL,
  assignment, cookie, and private-key shapes.
- Risk: a repair loop retries forever. Mitigation: immutable timeout, monotonic
  attempts, stable fingerprints, and explicit repair-budget escalation.
- Risk: lane selection skips required backend behavior. Mitigation: conservative
  runtime path rules and declared impact can only add lanes.
- Risk: controller state becomes the authority source. Mitigation: preflight
  always reparses the active V2 plan and compares its authority fingerprint.
- Risk: Phase 3 grows into agent orchestration. Mitigation: expose manual
  reruns only and keep `AgentRuntime` absent until Phase 4.

## Completion Notes

Phase 3 is complete. Controller-managed tasks now select canonical verification
from effective risk and runtime impact, categorize failures, preserve bounded
redacted diagnostics, record sanitized episodes, detect meaningful progress,
and stop after a finite repair budget. A passing task becomes
`ready_for_review`; this grants no publication authority. Worktree isolation,
agent execution, cancellation, and resume remain Phase 4.

## Follow-Ups

- [ ] Create the Phase 4 isolated agent execution plan only after this phase is
      verified and reviewed.
