# ADR: Risk-Aware Verification And Bounded Repair Evidence

- Status: Accepted
- Date: 2026-08-09
- Decision makers: Core kit maintainer

## Context

Structured task control can prove authority, scope, ownership, and effective
risk, but developers still manually choose verification depth and interpret raw
failures. There is no stable failure vocabulary, meaningful-progress test,
repair budget, or sanitized record explaining why a task passed or stopped.

## Decision

Add a Phase 3 verification controller behind `backendkit task verify`.

- Low effective risk selects `fast`; medium and high select `full`.
- Declared API, database, auth, queue, environment, or external-integration
  impact adds `runtime`. Conservative database, runtime-platform, worker,
  controller, integration/E2E, and external-adapter path rules may also add it.
- High risk alone does not start Docker-backed runtime verification when the
  task is harness-only.
- Canonical profiles remain the sensor owners. Task verification invokes them
  in captured mode and maps failed registered steps to stable failure codes and
  remediation text.
- A task fingerprint covers current plan authority, effective risk, task-owned
  paths, and their content. Failure identity adds the stable failed boundary.
- The initial failure may be followed by the V2 plan's configured number of
  unchanged repair opportunities. A later unchanged failure escalates. A
  meaningful task fingerprint change resets that boundary's repeat count.
- State schema V2 records monotonic attempts, transitions, and stable failure
  records. Existing V1 baselines migrate in memory and bind to the current
  impact-aware authority hash on their first verification attempt.
- Diagnostics are local, redacted, capped at 16 KiB, and stored with mode 0600
  under `.tmp/backendkit/tasks/<task-id>/diagnostics/`.
- Every profile attempt writes a schema-versioned sanitized episode under the
  task directory. Episodes contain approved identifiers, paths, hashes, risk
  rules, lanes, durations, transitions, status, stop reason, and an optional
  diagnostic reference—never raw output, prompts, environment values, secrets,
  request bodies, tokens, cookies, or PII.

## Rationale

- Risk and runtime impact answer different questions and should not be
  conflated.
- Stable categories make repair and review attributable without preserving raw
  terminal history.
- Content-derived fingerprints distinguish retrying from meaningful progress.
- A finite repair budget creates a deterministic stop condition before an agent
  runtime is introduced.
- Ignored atomic files are sufficient for local controller evidence and remain
  separate from durable, reviewed repository records.

## Consequences

- Controller-managed verification can move tasks to `repairing`,
  `ready_for_review`, `escalated`, or `failed`.
- `ready_for_review` proves required local lanes for the recorded fingerprint;
  it does not authorize commit, push, PR mutation, merge, or deployment.
- High-risk success still requires human review.
- A task in a terminal or ambiguous `verifying` state cannot simply rerun;
  safe resume and cancellation belong to Phase 4.
- Runtime-step failures initially use the stable aggregate
  `runtime.verification` category. Finer migration/integration/E2E categories
  require structured runtime-sensor events rather than output guessing.

## Alternatives Considered

- Run runtime for every high-risk task: rejected because harness/CI policy can
  be high risk without depending on application services.
- Infer detailed runtime failures from terminal text: rejected as brittle and
  unsafe for long-term policy.
- Store raw logs in episodes: rejected because logs commonly contain secrets,
  URLs, tokens, request data, and excessive noise.
- Unlimited retries after any changed file: rejected because irrelevant edits
  could prevent convergence.
- Add agent repair now: rejected because worktree/runtime isolation is a
  separate Phase 4 trust boundary.

## Links / References

- `docs/adr/0019-canonical-backendkit-harness.md`
- `docs/adr/0020-structured-task-authority.md`
- `docs/engineering/backendkit-cli.md`
- `docs/exec-plans/active/2026-08-09_risk-aware-verification-repair.md`
- `_WIP/2026-08-09_backend-loop-engineering-proposal.md`
