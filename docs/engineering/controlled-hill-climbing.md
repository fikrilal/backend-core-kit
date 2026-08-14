# Controlled Harness Hill Climbing

Phase 8 improves the harness from independently reviewed outcomes without
granting the harness authority to modify itself.

## Current State

Operational hill climbing is disabled. The operating ledger has zero reviewed
tasks, below the required five tasks across two risk classes with at least one
repair or escalation. The empty
`docs/engineering/harness-improvement-ledger.json` is therefore the only valid
improvement ledger today.

Read-only inspection commands are:

```bash
npm run backendkit -- improve check
npm run backendkit -- improve analyze
npm run backendkit -- improve shadow --hypothesis <id>
```

They validate and report. They cannot edit a ledger, create a plan, change a
gate, launch an agent, commit, push, or publish.

## Evidence Trends

Analysis consumes only `operating-evidence-ledger.json` and reports:

- reviewed task and represented risk-class counts;
- repair-or-escalation rate in basis points;
- terminal escalation/failure rate in basis points;
- stable stop reasons appearing in at least two reviewed tasks.

No prose, source diff, prompt, diagnostic, or model output enters aggregation.
An LLM may later explain deterministic results, but it does not own the count or
policy decision.

## Hypothesis Contract

After evidence becomes eligible, a proposed entry must identify:

- a recurring stop reason and minimum affected baseline tasks;
- exact baseline task IDs;
- a harness target component;
- either repair-or-escalation rate or terminal escalation rate;
- minimum predicted improvement in basis points;
- a later reviewed-task evaluation window;
- exact rollback file paths;
- a human owner.

Every hypothesis includes all immutable invariants:

- `authority.no-expansion`
- `evidence.no-sensitive-data`
- `publication.no-expansion`
- `risk.no-lowering`
- `verification.no-weakening`

Missing one invalidates the entry.

## Approval And Isolated Rollout

Moving beyond `proposed` requires a different human approver and a separate V2
execution plan. That plan must be high risk, declare harness impact, contain
only harness/governance paths, and grant exactly `edit, verify`. Commit, push,
PR, merge, migration, and deployment authority are invalid in an improvement
plan. Publication remains a later independent handoff.

The improvement lifecycle is:

```text
proposed -> approved -> evaluating -> kept | reverted
```

All lifecycle changes are reviewed source edits. The CLI does not perform them.

## Shadow Evaluation

Shadow mode selects reviewed tasks after the approval timestamp, excludes every
baseline task, sorts deterministically, and uses only the declared evaluation
window. It returns:

- `inconclusive` when too few later tasks exist;
- `keep` when the rate improves by at least the predicted basis points;
- `revert` otherwise.

It changes no enforcement. A terminal entry records a human decision, measured
baseline/observed rates, and exact evaluated task IDs. Validation rejects a
decision that contradicts deterministic shadow evidence. Humans still review
unmeasured effects before accepting `keep`.
