# Current-Session Agent Harness Correction

**Plan version:** 2
**Task ID:** current-session-agent-harness-20260809
**Status:** completed
**Owner:** Dante and Codex
**Risk:** high
**Authority:** correct Phase 4 to support the current Codex conversation; no nested agent, commit, publication, or external mutation
**Allowed paths:** _WIP/2026-08-09_backend-loop-engineering-proposal.md, docs/adr/0022-isolated-agent-execution.md, docs/engineering/agent-pr-loop.md, docs/engineering/backendkit-cli.md, docs/engineering/guardrails.md, docs/engineering/parallel-agent-workflow.md, docs/exec-plans/README.md, docs/exec-plans/active/2026-08-09_current-session-agent-harness.md, docs/exec-plans/completed/2026-08-09_current-session-agent-harness.md, docs/exec-plans/completed/2026-08-09_isolated-agent-execution.md, docs/guide/development-workflow.md, tools/backendkit/
**Allowed actions:** edit, verify
**Maximum risk:** high
**Repair limit:** 2
**Task timeout:** 3h

Date: 2026-08-09
Related issue/PR: N/A

## Objective

Correct Phase 4 so `backendkit` is a repository harness used internally by the
current conversational Codex agent, not a launcher for another coding agent.
Retain useful worktree isolation and durable task evidence while removing the
nested Codex runtime and process-orchestration architecture.

## Constraints

- The user continues working in one normal Codex conversation.
- The current Codex agent invokes repository CLI commands internally.
- `backendkit` manages authority, workspace identity, state, verification, and
  safe cleanup; it never invokes a model or owns model-session lifecycle.
- Current-session context, interruption, and cancellation remain Codex product
  responsibilities.
- Candidate verification must run against the isolated task worktree.
- Publication remains separately authorized and out of scope.

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

1. No repository code launches Codex, another model, or an agent subprocess.
2. The current agent can prepare and inspect an isolated task workspace, edit
   there with ordinary tool calls, and invoke workspace-aware verification.
3. Workspace metadata is strict, private, adapter-neutral, and sufficient to
   validate repository identity, authority, branch, base, and path after a
   conversation restart or context compaction.
4. Cancellation records task intent only; it never kills the current Codex
   process or trusts a persisted PID.
5. Cleanup remains explicit and refuses active or dirty worktrees while
   preserving the candidate branch.
6. Proposal, ADR, CLI, guardrail, workflow, and execution-plan docs consistently
   describe a single conversational agent using the harness internally.

## Implementation Checklist

- [x] Remove `AgentRuntime`, Codex/scripted adapters, and nested process orchestration.
- [x] Replace execution state with strict task-workspace metadata and service commands.
- [x] Make task verification automatically target an owned isolated workspace.
- [x] Rewrite all related Phase 4 architecture and workflow documentation.
- [x] Run focused, full, and applicable lifecycle verification.

## Decision Log

- 2026-08-09: The current Codex conversation is the agent runtime -> avoids
  recursive Codex sessions and preserves one continuous user interaction.
- 2026-08-09: Keep worktree/state mechanics but expose them as internal task
  workspace operations -> retains isolation without building an agent platform.
- 2026-08-09: Record cancellation as lifecycle state only -> process control
  belongs to the Codex host, not repository code.

## Verification

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npx jest --runInBand tools/backendkit/workspace tools/backendkit/command.spec.ts`
  — 4 suites and 15 tests passed.
- `npm test` — 71 suites and 343 tests passed.
- `npm run backendkit -- task preflight --task
current-session-agent-harness-20260809 --action verify` — passed at high
  effective risk with 18 task-owned paths and 3 controller artifacts.
- `npm run backendkit -- task verify --task
current-session-agent-harness-20260809` — attempt 1 passed the canonical
  non-Docker `full` lane.

## Runtime Evidence

- Environment: local repository and temporary Git fixtures.
- Dependencies/services: git only.
- Executed request/job/flow: prepared and validated a real linked worktree in a
  temporary Git repository; confirmed candidate edits do not dirty the primary
  worktree, dirty cleanup is refused, clean cleanup removes the worktree, and
  the candidate branch is preserved.
- Artifact path(s):
  `.tmp/backendkit/tasks/current-session-agent-harness-20260809/episodes/attempt-1.json`.
- Relevant log/trace/request IDs: N/A.
- Notes: no nested Codex process will be launched.

## Risks And Mitigations

- Risk: docs retain contradictory nested-agent instructions.
  Mitigation: search the proposal and durable docs for runtime/launcher language.
- Risk: verification accidentally reads the primary worktree.
  Mitigation: resolve and validate workspace metadata before constructing the
  candidate repository and verification controller.
- Risk: workspace cleanup deletes unrecorded work.
  Mitigation: retain the existing clean-worktree refusal and candidate branch.

## Completion Notes

Phase 4 now isolates repository state for the current conversational agent. The
repository CLI owns only deterministic task workspace lifecycle and
verification concerns; all nested model, prompt, process, and output
orchestration was removed before commit.

## Follow-Ups

- [ ] Phase 5 must build current-agent event intake, not a model launcher.
