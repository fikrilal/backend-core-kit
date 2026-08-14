# Execution Plans

This directory is the system of record for non-trivial implementation plans.

Use execution plans when work spans multiple steps, risks, or decisions that can
drift across sessions.

## Lifecycle

1. Create a plan file in `docs/exec-plans/active/` from `docs/exec-plans/_template.md`.
2. For agent-loop work, authorize the V2 boundary with
   `npm run backendkit -- task begin --plan <path>` before task edits.
3. Update the same file as work progresses without changing authority-bearing
   metadata. An authority change requires a new task baseline.
4. Record decisions, verification evidence, and known blockers.
5. Move the file to `docs/exec-plans/completed/`, set `Status` to `completed`,
   and close its implementation checklist when done.
6. Add unresolved follow-ups to `docs/exec-plans/tech-debt-tracker.md`.

## File Naming

Use:

```text
YYYY-MM-DD_short-topic.md
```

Examples:

- `2026-05-21_auth-token-rotation.md`
- `2026-05-21_profile-image-cleanup-worker.md`
- `2026-05-21_openapi-contract-gate.md`

## What Belongs In A Plan

- concrete objective and constraints
- acceptance criteria
- risk class and impact areas
- implementation checklist
- decision log
- verification evidence
- runtime evidence when static checks are insufficient
- follow-up debt

V2 active and queued plans also require the structured metadata in the current
template. Allowed paths are explicit repository-relative files or directory
prefixes; roots, absolute paths, traversal, whitespace ambiguity, and globs are
invalid. Allowed actions are independent grants. Plan parsing never grants an
action that was not explicitly authorized by the user.

Run `npm run backendkit -- knowledge check` to validate lifecycle and schema
rules. Existing completed plans created before V2 are grandfathered; new active
and queued plans are not.

After `task begin`, use `npm run backendkit -- task verify --task <task-id>` to
select risk/impact-derived verification and record the attempt. `Repair limit`
is the number of unchanged repair opportunities permitted after the initial
failure; it is not an unlimited retry count. A meaningful task fingerprint
change resets the repeated count for that stable failed boundary.

## What Does Not Belong Here

- tiny one-file edits with no risk or coordination overhead
- speculative ideas without an active task
- broad product roadmaps

Put early analysis or exploratory proposals in `_WIP/` until the work is ready
to execute.

## Risk Classes

- `low`: docs, tests, narrow refactors, local harness work with no runtime/API
  behavior change
- `medium`: feature behavior, API response fields, mappers, queues, persistence
  queries, config, or non-breaking contract changes
- `high`: auth/session/RBAC, security, migrations, data deletion, token handling,
  idempotency, CI/release/infra, or breaking API behavior

## Related Docs

- `docs/engineering/agent-pr-loop.md`
- `docs/engineering/guardrails.md`
- `docs/engineering/parallel-agent-workflow.md`
