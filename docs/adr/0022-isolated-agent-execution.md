# ADR: Current-Agent Workspace Isolation

- Status: Accepted
- Date: 2026-08-09
- Decision makers: Core kit maintainer

## Context

The task and verification controllers enforce authority, scope, risk,
verification depth, and finite repair attempts, but candidate edits can still
mix with the user's primary worktree. The user works through one continuous
Codex conversation and expects that current agent to use repository harness
tools internally. Launching another Codex CLI process would split context,
duplicate agent lifecycle, and turn a repository harness into an agent platform.

## Decision

Add Phase 4 task-workspace operations behind `backendkit task workspace`.

- The active Codex conversation is the only coding agent. Repository code never
  launches Codex, another model, or an agent subprocess.
- The current agent internally begins a task, prepares its workspace, then uses
  ordinary filesystem and command tools with the returned path as `workdir`.
- Every isolated task owns a deterministic `backendkit/<task-id>` branch and a
  linked worktree under the primary repository's ignored
  `.tmp/backendkit/worktrees/` directory, created from the authorized base.
- A short-lived private repository command lock serializes workspace prepare,
  cancel, and cleanup mutations. It does not own or represent the Codex process.
- Task lifecycle remains in `state.json`. Strict mode-0600 `workspace.json`
  records only task/authority identity and Git workspace identity; it rejects
  model, prompt, output, session, environment, credential, and PID fields.
- `task workspace status` validates repository identity, authority, base
  ancestry, branch, and canonical path after context compaction, interruption,
  or a later conversational turn.
- `task preflight` and `task verify` automatically target the owned worktree
  when workspace metadata exists. Verification evidence remains under the
  primary repository's ignored task directory.
- Cancellation records task lifecycle intent only. Interrupting the current
  agent remains a Codex host responsibility; repository code never kills an
  agent process.
- Cleanup is explicit, requires a stopped task and clean validated worktree,
  removes only the linked worktree, and preserves the task branch.
- Commit, push, PR mutation, merge, migration, and deployment remain separate
  authority boundaries.

## Rationale

- One conversational agent preserves user context and keeps the harness focused
  on deterministic repository concerns.
- A linked worktree is the smallest Git-native isolation boundary that keeps
  user-owned dirty paths out of task edits and remains inspectable across turns.
- Nesting the ignored worktree beneath the repository keeps dependencies
  discoverable and the workspace accessible to the current Codex host without
  adding another sandbox layer.
- Adapter-neutral workspace metadata is sufficient for safe rediscovery; model
  process or session serialization is unnecessary and unsafe.

## Consequences

- Agents must consistently use the returned task workspace as the working
  directory after preparation.
- Task worktrees consume disk until explicit safe cleanup.
- Candidate branches remain after cleanup and require a later reviewed handoff
  or manual deletion policy.
- The initial automated workspace mutation is single-flight per repository;
  manual parallel tasks still require disjoint ownership.
- Conversation cancellation, compaction, and model capabilities remain outside
  repository control. The harness records and validates repository state only.

## Alternatives Considered

- Launch Codex CLI from `backendkit`: rejected because it creates a second agent
  session, loses conversational continuity, duplicates sandboxing, and expands
  the harness into an agent runtime.
- Run in the primary worktree with post-run path checks: rejected because path
  checks cannot prevent contamination of user-owned dirty state.
- Persist prompts, model output, or process IDs for resume: rejected because
  these are sensitive and do not prove safe repository continuation.
- Force-remove dirty worktrees during cleanup: rejected because that can destroy
  the only candidate copy.
- Add a database or queue for local state: rejected because atomic ignored JSON,
  Git branches, and linked worktrees satisfy the initial durability boundary.

## Links / References

- `docs/adr/0019-canonical-backendkit-harness.md`
- `docs/adr/0020-structured-task-authority.md`
- `docs/adr/0021-risk-aware-verification-repair.md`
- `docs/engineering/backendkit-cli.md`
- `docs/engineering/parallel-agent-workflow.md`
- `_WIP/2026-08-09_backend-loop-engineering-proposal.md`
