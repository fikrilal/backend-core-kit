# ADR: Structured Task Authority And Local Controller State

- Status: Accepted
- Date: 2026-08-09
- Decision makers: Core kit maintainer

## Context

Phase 1 established one harness command and verification owner, but execution
plans still expressed scope, authority, and risk only as prose. A coding agent
or script could not prove which dirty paths predated a task, whether an action
was authorized, whether risk rose above approval, or whether plan authority
changed after work started.

## Decision

Use execution-plan schema V2 as the human-authorized task contract and keep
schema-versioned controller state under ignored `.tmp/backendkit/tasks/`.

- V2 metadata declares a stable task ID, status, owner, risk, authority summary,
  allowed paths, allowed actions, maximum risk, repair limit, and timeout.
- Allowed paths are normalized repository-relative files or directory prefixes;
  ambiguous roots, traversal, globs, and symlink escapes are rejected.
- `task begin` records the Git base revision, authority fingerprint, and
  pre-existing dirty paths with content fingerprints through an atomic write.
- A pre-existing path remains user-owned only while its content fingerprint is
  unchanged. A later content change makes it task-owned and subject to scope and
  risk checks.
- Changed-path policy may raise declared risk and never lower it. Unknown paths
  default to medium; security-sensitive backend, persistence, queue, dependency,
  CI, and harness paths default to high.
- `task preflight` validates plan integrity, requested action, committed and
  worktree changes, scope, and effective risk before expensive work.
- The three exact untracked architecture/duplication report outputs are labeled
  as controller artifacts instead of task-owned source; no wildcard path is
  exempted.
- Only active and queued plans must use V2 prospectively. Historical completed
  plans without V2 metadata remain valid records.

## Rationale

- Human-readable Markdown remains the source of granted authority.
- Typed parsing and stable policy IDs make enforcement reviewable and testable.
- Path-plus-content ownership protects unrelated dirty work without introducing
  line-level merge machinery.
- Atomic ignored JSON is sufficient for a local single-repository controller;
  a database or queue would add operational complexity without improving this
  phase.

## Consequences

- Non-trivial new agent tasks need a V2 plan before controller-managed work.
- Changing authority-bearing metadata invalidates the existing task baseline.
- Path-level ownership cannot safely coordinate concurrent edits to the same
  file; isolated worktrees and locking remain required in a later phase.
- Task state is local and recoverable but is not durable review evidence.
- Risk-aware verification, repair, episodes, agent execution, and publication
  remain separate later phases.

## Alternatives Considered

- Continue with prose-only plans: rejected because authority and scope remain
  unenforceable.
- Store state in Postgres/Redis/BullMQ: rejected because local atomic files meet
  current durability and concurrency requirements.
- Treat all initial dirty paths as permanently outside task ownership: rejected
  because later edits to those paths could escape scope checks.
- Migrate every historical completed plan to V2: rejected as noisy history
  rewriting with no control benefit.

## Links / References

- `docs/adr/0019-canonical-backendkit-harness.md`
- `docs/engineering/backendkit-cli.md`
- `docs/exec-plans/active/2026-08-09_structured-task-control.md`
- `_WIP/2026-08-09_backend-loop-engineering-proposal.md`
