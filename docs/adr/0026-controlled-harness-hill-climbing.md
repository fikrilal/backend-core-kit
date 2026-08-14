# ADR: Controlled Harness Hill Climbing

- Status: Accepted
- Date: 2026-08-10
- Decision makers: Core kit maintainer

## Context

The harness can now retain independently reviewed operating evidence, but
changing verification policy from a few outcomes can create Goodhart effects,
weaken safety boundaries, or let the harness optimize its own grader. Phase 8
needs a controlled improvement protocol, not an autonomous self-modifying loop.

## Decision

- Aggregate only the sanitized versioned operating ledger. Never analyze raw
  episodes, diagnostics, prompts, model output, or CI logs.
- Report deterministic task/risk counts, repair-or-escalation rate, terminal
  escalation rate, and stop reasons recurring in at least two reviewed tasks.
- Keep the improvement ledger empty and hill climbing disabled until Phase 7
  eligibility reaches five tasks, two risk classes, and one repair/escalation.
- Represent each later hypothesis as strict structured metadata: recurring
  pattern, target component, rate metric, minimum expected improvement,
  baseline tasks, evaluation window, rollback files, and human owner.
- Every hypothesis must preserve all immutable invariants: no authority
  expansion, no sensitive evidence, no publication expansion, no risk lowering,
  and no verification weakening.
- Approved/evaluating hypotheses require independent human approval and a
  separate high-risk V2 execution plan restricted to harness paths and exactly
  `edit, verify` actions.
- Evaluate later reviewed tasks in shadow mode. Shadow mode is read-only and
  returns `keep`, `revert`, or `inconclusive` based on the declared rate and
  minimum improvement.
- Terminal ledger entries require a human decision whose task IDs and measured
  rates exactly match deterministic shadow evidence.
- Provide read-only `improve check`, `improve analyze`, and `improve shadow`
  commands. They never create plans, edit policy/ledgers, roll out code, or
  publish work.

## Rationale

This design makes improvement falsifiable and reversible while preserving the
normal engineering workflow. Deterministic aggregation identifies patterns;
humans decide whether a hypothesis deserves an isolated task; later independent
outcomes decide whether the change should stay.

An empty valid system is the correct current behavior. Inventing hypotheses
before evidence eligibility would undermine the purpose of the threshold.

## Consequences

- Phase 8 code exists, but operational hill climbing remains disabled until real
  evidence is promoted under the Phase 7 contract.
- Harness improvement rollout still uses ordinary plans, tests, review, and
  explicit publication authority.
- Initial metrics are intentionally limited to rates reconstructable from the
  sanitized ledger. Latency or quality scoring needs a later schema decision.
- The controller gives advice only; a human performs and reviews source edits.

## Alternatives Considered

- Let an LLM summarize raw traces and patch the harness: rejected because the
  inputs are sensitive and the output could bypass deterministic policy.
- Generate hypotheses before five reviewed tasks: rejected because there is no
  accepted operating basis.
- Automatically keep a rollout when its metric improves: rejected because
  invariants and unmeasured regressions still need human review.
- Permit broad repository rollback: rejected in favor of exact canonical files.

## Links / References

- `docs/adr/0025-test-oracles-operating-evidence.md`
- `docs/engineering/controlled-hill-climbing.md`
- `docs/engineering/operating-evidence.md`
- `_WIP/2026-08-09_backend-loop-engineering-proposal.md`
