# ADR: Event-Driven Task Intake

- Status: Accepted
- Date: 2026-08-09
- Decision makers: Core kit maintainer

## Context

The harness can authorize, isolate, verify, and rediscover a task, but every
task still requires manual activation. Phase 5 needs durable queued-plan intake,
delivery deduplication, interruption recovery, and scheduled maintenance without
turning the repository into an agent runtime or adding another queue service.

Events are untrusted selectors. They must not create authority from labels,
payloads, schedules, or repository content. The approved V2 execution plan
remains the only source of task boundaries.

## Decision

- Add one-shot `backendkit events run --once` intake. It deterministically
  selects at most one lexically ordered plan from `docs/exec-plans/queued/`.
- A queued plan must already contain complete human-approved V2 authority.
  Intake changes only its lifecycle status and location from `queued` to
  `active`; its authority hash must remain unchanged.
- Before mutation, intake writes a strict mode-0600 claimed receipt under
  `.tmp/backendkit/events/`. The receipt contains event, plan hash, authority,
  task, and lifecycle identity only—never payload text, prompts, model/session
  data, credentials, command output, or process IDs.
- The event ID is deterministically derived from source kind, task ID, and
  queued-plan source hash. Replaying unchanged delivery cannot create another
  task.
- Activation and recovery run under the existing short repository command
  lock. They handle queued-only, queued-plus-active, active-only, and
  task-created states idempotently. Conflicting files or unrelated active work
  fail closed.
- Default concurrency is one active task or active plan per repository.
  Parallel event activation is not enabled.
- Successful intake creates ordinary authorized task state and returns control.
  The current conversational agent may then prepare the task workspace through
  the Phase 4 command. Repository code never launches an agent.
- Add `backendkit maintenance run --once` with a fixed code-owned observation
  registry: knowledge lifecycle, architecture report, duplication reports, and
  production dependency audit. An external scheduler may invoke it; the
  repository does not run a daemon or cron loop.
- Maintenance is source-read-only: it cannot edit application, policy, plans,
  baselines, or task authority. Existing architecture and duplication sensors
  may refresh their explicit `_WIP` controller reports.
- GitHub issue, check-failure, and webhook adapters are deferred. Future
  adapters may normalize and deduplicate task requests only; they cannot grant
  actions or modify risk.

## Rationale

- Filesystem plans and atomic private JSON are sufficient for one local intake
  consumer and avoid operating Postgres, Redis, BullMQ, or a hosted controller.
- Deterministic activation preserves a small audit surface and makes delivery
  replay harmless.
- Writing the claimed receipt before plan mutation gives recovery enough
  evidence to converge after interruption without serializing model state.
- One-shot commands compose with cron, CI, or a future approved host while
  keeping scheduling outside repository code.

## Consequences

- Queued plans must be explicitly authored and approved before an event can
  activate them.
- A task awaiting review continues to block later event intake until its plan
  lifecycle is resolved.
- Ambiguous receipt directories, conflicting active plans, and unrelated
  active tasks require human inspection rather than automatic takeover.
- Dependency maintenance requires registry network access when the external
  scheduler invokes the one-shot profile.
- Event receipts remain ignored local controller state and are not publication
  evidence.

## Alternatives Considered

- Launch Codex after intake: rejected because the active conversation remains
  the sole agent and repository code must not own model lifecycle.
- Use BullMQ or Redis: rejected because a single local consumer does not justify
  another operational subsystem.
- Poll continuously from a daemon: rejected because an external scheduler can
  invoke a bounded one-shot command.
- Derive authority from an issue label or webhook: rejected because delivery
  metadata is untrusted and cannot approve repository mutation.
- Automatically create maintenance plans: rejected because observations need
  human interpretation before they become authorized work.

## Links / References

- `docs/adr/0020-structured-task-authority.md`
- `docs/adr/0022-isolated-agent-execution.md`
- `docs/engineering/backendkit-cli.md`
- `docs/engineering/agent-pr-loop.md`
- `_WIP/2026-08-09_backend-loop-engineering-proposal.md`
