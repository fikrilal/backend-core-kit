# Execution Plans

This directory is the system of record for non-trivial implementation plans.

Use execution plans when work spans multiple steps, risks, or decisions that can
drift across sessions.

## Lifecycle

1. Create a plan file in `docs/exec-plans/active/` from `docs/exec-plans/_template.md`.
2. Update the same file as work progresses.
3. Record decisions, verification evidence, and known blockers.
4. Move the file to `docs/exec-plans/completed/` when done.
5. Add unresolved follow-ups to `docs/exec-plans/tech-debt-tracker.md`.

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
