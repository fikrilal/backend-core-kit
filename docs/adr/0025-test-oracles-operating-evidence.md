# ADR: Test Oracles And Operating Evidence

- Status: Accepted
- Date: 2026-08-10
- Decision makers: Core kit maintainer

## Context

Deterministic verification can still reward weak tests, hide slow feedback, or
let agent-authored checks confirm the same misunderstanding as the code. The
harness also needs reviewed real-task outcomes before Phase 8 may recommend
changes to itself. Raw episodes cannot simply be committed because they are
local, may contain sensitive metadata, and do not prove independent CI review.

## Decision

- Enforce conservative global coverage floors below the measured baseline:
  45% statements, 38% branches, 40% functions, and 46% lines. Coverage is a
  regression sensor, not proof of behavior.
- Record profile duration baselines and generous advisory budgets. A slow run
  emits a warning but does not fail CI during calibration.
- Maintain a typed high-risk oracle registry. Every scenario has stable
  identity, observable acceptance text, and one or more existing integration or
  E2E files. Unit-only or missing evidence is invalid.
- Pilot Stryker only against the pure verification lane-selection policy. The
  command is manual and absent from canonical profiles. Wider mutation scope or
  a blocking CI lane requires later operating evidence and a separate decision.
- Harden durable episode values to canonical paths and stable identifiers and
  reject unknown nested fields, duplicates, path escape, and secret/PII-shaped
  strings.
- Add a strict versioned operating ledger. An entry requires a unique task,
  accepted `human:*` review identity, successful clean-checkout GitHub Actions
  run, immutable revision, episode hash/fingerprint, passed lanes, and bounded
  outcome metadata.
- Start the ledger empty. Promotion is a reviewed source edit under an explicit
  plan, not an autonomous CLI write. `backendkit evidence check` validates the
  ledger and reports advisory hill-climbing eligibility.
- Eligibility requires at least five reviewed tasks, two represented risk
  classes, and one repair or escalation. Eligibility never grants task or
  policy authority.

## Rationale

The three signals answer different questions: coverage catches broad test loss,
scenario mappings prove critical behavior through independent runtime tests,
and mutation testing samples whether assertions can detect policy faults.
Combining them is stronger than maximizing any one metric.

Manual reviewed promotion keeps the ledger small and auditable. It avoids
building another approval subsystem before real operating evidence exists.

## Consequences

- A material global coverage regression now fails `test:coverage`.
- Duration regressions are visible but cannot create flaky failures yet.
- Changes to high-risk behavior should update its oracle mapping when evidence
  moves or expands.
- The mutation pilot adds development dependencies and takes roughly 25 seconds
  locally, but developers run it only when the pure policy or its tests change.
- Phase 8 remains disabled while the ledger is below the accepted threshold.

## Alternatives Considered

- Raise coverage to the current measured percentages: rejected because minor
  tool variance would fail and encourage low-value line chasing.
- Make mutation testing repository-wide and blocking: rejected because the
  accepted phase calls for one measured pilot and the cost is not calibrated.
- Automatically import every local episode: rejected because local success is
  not independent review or clean-checkout evidence.
- Store review prose and CI logs in the ledger: rejected because structured
  metadata is sufficient for eligibility and safer to retain.

## Links / References

- `docs/engineering/operating-evidence.md`
- `docs/engineering/backend-runtime-evidence.md`
- `docs/standards/testing-strategy.md`
- `_WIP/2026-08-09_backend-loop-engineering-proposal.md`
- [StrykerJS Jest runner](https://stryker-mutator.io/docs/stryker-js/jest-runner/)
- [StrykerJS configuration](https://stryker-mutator.io/docs/stryker-js/configuration/)
