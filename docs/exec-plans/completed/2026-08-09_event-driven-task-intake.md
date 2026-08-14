# Event-Driven Task Intake

**Plan version:** 2
**Task ID:** event-driven-task-intake-20260809
**Status:** completed
**Owner:** Dante and Codex
**Risk:** high
**Authority:** implement and verify Phase 5 local event intake and maintenance; no agent launch, commit, publication, or external mutation
**Allowed paths:** _WIP/2026-08-09_backend-loop-engineering-proposal.md, docs/adr/0023-event-driven-task-intake.md, docs/adr/README.md, docs/engineering/agent-pr-loop.md, docs/engineering/backendkit-cli.md, docs/engineering/guardrails.md, docs/exec-plans/README.md, docs/exec-plans/active/2026-08-09_event-driven-task-intake.md, docs/exec-plans/completed/2026-08-09_event-driven-task-intake.md, docs/guide/development-workflow.md, tools/backendkit/
**Allowed actions:** edit, verify
**Maximum risk:** high
**Repair limit:** 2
**Task timeout:** 4h

Date: 2026-08-09  
Related issue/PR: N/A

## Objective

Implement Phase 5 as durable repository-local event intake for the current
conversational agent: activate one already-authorized queued plan at a time,
deduplicate delivery, recover interrupted intake, and expose scheduled
read-only maintenance as a one-shot registered command.

## Constraints

- Events are untrusted requests and cannot grant actions, broaden paths, raise
  risk, or alter authority-bearing plan fields.
- Repository code never launches Codex, another model, or an agent process.
- Use ignored atomic JSON and existing task/workspace state; do not add a
  database, Redis, BullMQ, daemon, or internal scheduler.
- Queue activation may change only plan lifecycle status and location from
  `queued` to `active`; the authority hash must remain unchanged.
- Default to one active task per repository and fail closed on ambiguous state.
- Maintenance may run registered observation commands and generate existing
  controller reports, but cannot create or edit application/policy code.
- GitHub event adapters are documented extension work, not implemented now.

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

1. `backendkit events run --once` deterministically activates at most one valid
   queued V2 plan and creates its authorized task state without launching an
   agent.
2. Event receipts are strict, private, bounded, durable, and recover safely
   across interruption without creating duplicate tasks.
3. Intake refuses concurrent active tasks, invalid plans, authority drift,
   conflicting active destinations, and ambiguous receipt/task state.
4. Activation changes only plan status/path; all authority-bearing metadata and
   its hash remain unchanged.
5. `backendkit maintenance run --once` executes only a fixed registered
   observation set and records no raw command output, secrets, or authority.
6. Documentation explains that an external scheduler may invoke one-shot
   maintenance and that GitHub adapters only normalize/deduplicate requests.

## Implementation Checklist

- [x] Add strict event receipt storage, queued-plan discovery, activation, recovery, and single-flight policy.
- [x] Add CLI event intake and focused failure/recovery/deduplication tests.
- [x] Add registered one-shot maintenance observations and tests.
- [x] Update ADR, CLI, workflow, guardrail, execution-plan, and proposal docs.
- [x] Run focused, full, and applicable runtime verification.

## Decision Log

- 2026-08-09: Activate an already-authorized queued plan rather than deriving
  authority from an event -> triggers select intent but cannot grant it.
- 2026-08-09: Persist a recoverable receipt before repository mutation -> a
  crash can converge without duplicate task creation or silent loss.
- 2026-08-09: Use externally scheduled one-shot maintenance -> avoids building
  a daemon or second queue system inside the repository harness.
- 2026-08-09: Defer GitHub adapters -> local recovery and authority behavior
  must be proven first.

## Verification

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npx jest --runInBand tools/backendkit/events tools/backendkit/maintenance
tools/backendkit/command.spec.ts` — 3 suites and 17 tests passed.
- `npm test` — 73 suites and 352 tests passed before the final receipt-size
  negative fixture was added.
- `npm run backendkit -- task preflight --task
event-driven-task-intake-20260809 --action verify` — passed at high effective
  risk with 16 task-owned paths and 3 controller artifacts.
- `npm run backendkit -- task verify --task event-driven-task-intake-20260809`
  — attempt 1 passed the canonical non-Docker `full` lane.
- `npm run verify:ci-local` — passed after final hardening; 73 suites and 353
  tests passed with coverage, followed by all remaining full-profile gates.
- `npm run backendkit -- maintenance run --once` — all four registered
  observations passed; production audit reported zero vulnerabilities.

## Runtime Evidence

- Environment: local repository and temporary filesystem/Git fixtures.
- Dependencies/services: git and local Node.js toolchain only.
- Executed request/job/flow: activated queued plans in temporary Git
  repositories, preserved authority across lifecycle promotion, recovered a
  claimed event after simulated interruption, deduplicated replay, and refused
  unrelated active work. Also executed the real one-shot maintenance registry.
- Artifact path(s):
  `.tmp/backendkit/tasks/event-driven-task-intake-20260809/episodes/attempt-1.json`
  and temporary mode-0600 event receipts created by focused fixtures.
- Relevant log/trace/request IDs: N/A.
- Notes: no nested Codex process or external event source will be invoked.

## Risks And Mitigations

- Risk: interruption leaves both queued and active plan copies.
  Mitigation: exact source hashes, deterministic active content, a durable
  claimed receipt, and idempotent recovery under the repository command lock.
- Risk: event delivery broadens authority.
  Mitigation: parse the queued plan, preserve its authority hash across
  activation, and derive task state only from the activated plan.
- Risk: maintenance becomes an arbitrary command runner.
  Mitigation: use a fixed code-owned registry with no event- or plan-supplied
  command arguments.
- Risk: concurrent intake creates multiple active tasks.
  Mitigation: fail-closed active-plan/task checks under the repository lock.

## Completion Notes

Phase 5 now provides durable one-shot queued-plan intake and source-read-only
maintenance for the current conversational agent. Events can activate approved
intent but cannot create authority or launch an agent. Local JSON receipts,
exact plan hashes, and task state provide deduplication and interrupted-intake
recovery without a new database, queue, daemon, or scheduler.

## Follow-Ups

- [ ] Add GitHub issue/check/webhook adapters only after local intake has operating evidence.
- [ ] Add an explicit human-authorized transition from `ready_for_review` back
      to `authorized` for repair or fresh task-controller verification.
- [ ] Add unresolved debt to `docs/exec-plans/tech-debt-tracker.md`.
