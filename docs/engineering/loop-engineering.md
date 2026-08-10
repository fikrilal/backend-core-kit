# Loop Engineering

The backend loop is a repository-local control system around the current Codex
conversation. It makes task authority, isolation, verification, repair,
handoff, evidence, and later harness improvement explicit and reconstructable.
It does not embed or launch a coding agent.

## Operating Model

```text
human-approved V2 plan or queued event
                 ↓
task baseline and conservative risk classification
                 ↓
validated linked worktree used by the current agent
                 ↓
risk-selected verification and bounded repair
                 ↓
ready_for_review with sanitized local evidence
                 ↓
separately authorized commit / push / draft PR
                 ↓
independent clean-checkout CI
                 ↓
reviewed operating ledger → advisory harness improvement
```

The execution plan grants authority. `backendkit` validates and enforces that
authority. Verification owns `ready_for_review`. The user separately authorizes
each external mutation. Network access and tool availability never grant
publication, migration, deployment, or production access.

## Production Readiness

The Phase 1–8 machinery is implemented and production-verified. Controlled
hill climbing is installed but intentionally inactive: the operating ledger has
not yet reached five independently reviewed, exact-revision CI-reproduced tasks
across two risk classes with a repair or escalation. This is an operational
evidence threshold, not missing controller code, and must not be satisfied with
fixtures or reconstructed claims.

Run the read-only prerequisite inspection before a harness task:

```bash
npm run backendkit -- doctor
```

The doctor validates required executables, repository identity, private-state
ignore policy, plan/oracle/evidence/improvement schemas, persisted task and
workspace metadata, and Docker availability. Docker unavailability is reported
as a warning because non-runtime profiles remain usable; `verify:e2e` remains
the authoritative runtime proof. Host sandbox and credential policy remain the
Codex host's responsibility and cannot be inferred by repository code.

Orphaned local lifecycle records are warnings: they are ignored `.tmp` state,
not repository truth, but can explain why single-flight event intake refuses a
new task. Complete the active plan/handoff or inspect the local state before
starting queued work; never delete active evidence merely to bypass the rule.

## Phase Traceability

| Phase | Capability                                                 | Primary implementation and evidence                                         |
| ----- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1     | Canonical profiles and safe process execution              | `tools/backendkit/process-runner.ts`, `verification/`, profile parity tests |
| 2     | Structured authority, scope, state, and risk               | `task/`, `policy/`, knowledge tests, ADR 0020                               |
| 3     | Risk-selected lanes, bounded repair, diagnostics, episodes | `task/task-verification.ts`, `evidence/`, ADR 0021                          |
| 4     | Current-agent linked-worktree isolation and recovery       | `workspace/`, ADR 0022                                                      |
| 5     | Deduplicated queued intake and read-only maintenance       | `events/`, `maintenance/`, ADR 0023                                         |
| 6     | Fresh action-specific handoff and independent CI           | `handoff/`, `ci/`, `.github/workflows/ci.yml`, ADR 0024                     |
| 7     | High-risk oracles and reviewed operating evidence          | `oracles/`, `evidence/operating-ledger.ts`, ADR 0025                        |
| 8     | Deterministic trends, hypotheses, shadow keep/revert       | `improvement/`, ADR 0026                                                    |

The cross-component scenario in
`tools/backendkit/loop-engineering.e2e.spec.ts` uses a temporary real Git
repository and linked worktree. It traverses authorization, editing,
verification, fresh commit/push/draft-PR approvals, and a local publication
adapter without contacting an external remote.

## Proposal Acceptance Status

Conditions 1–13 from the accepted proposal are mechanically covered by code,
negative fixtures, the cross-component scenario, canonical local profiles, and
hosted clean-checkout CI. Conditions 14–15 are operating milestones:

- Condition 14 remains pending until the reviewed operating ledger reaches its
  real-task diversity threshold.
- Condition 15 can occur only after condition 14 enables a falsifiable
  hypothesis, a human approves an isolated harness task, and later real tasks
  produce enough shadow evidence for a human keep/revert decision.

The loop is therefore production-ready for task execution and evidence
collection, but its self-improvement outer loop is correctly fail-closed.

## Source Of Truth

- Operator workflow: `docs/engineering/agent-pr-loop.md`
- Command and component reference: `docs/engineering/backendkit-cli.md`
- Plan contract: `docs/exec-plans/README.md`
- Guardrails: `docs/engineering/guardrails.md`
- Operating evidence: `docs/engineering/operating-evidence.md`
- Controlled improvement: `docs/engineering/controlled-hill-climbing.md`
- Accepted design: `_WIP/2026-08-09_backend-loop-engineering-proposal.md`
