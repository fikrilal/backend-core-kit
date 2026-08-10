# Initial Nested-Agent Phase 4 Design — Superseded Before Commit

**Plan version:** 2
**Task ID:** isolated-agent-execution-20260809
**Status:** completed
**Owner:** Dante and Codex
**Risk:** high
**Authority:** implement and verify Phase 4 locally; no commit, publication, or external mutation
**Allowed paths:** docs/adr/README.md, docs/adr/0022-isolated-agent-execution.md, docs/engineering/agent-pr-loop.md, docs/engineering/backendkit-cli.md, docs/engineering/guardrails.md, docs/engineering/parallel-agent-workflow.md, docs/exec-plans/README.md, docs/exec-plans/active/2026-08-09_isolated-agent-execution.md, docs/exec-plans/completed/2026-08-09_isolated-agent-execution.md, docs/guide/development-workflow.md, tools/backendkit/
**Allowed actions:** edit, verify
**Maximum risk:** high
**Repair limit:** 2
**Task timeout:** 3h

Date: 2026-08-09
Related issue/PR: N/A

## Objective

This plan originally interpreted Phase 4 as a repository controller that
launched another Codex CLI process in an isolated worktree. That interpretation
was rejected by the repository owner before commit because the intended product
experience is one continuous Codex conversation using repository CLI tools
internally.

## Constraints

- This document is retained as historical evidence, not current architecture.
- No nested-agent implementation from this plan may be restored.
- Current architecture is defined by ADR 0022 and the corrective execution plan
  `2026-08-09_current-session-agent-harness.md`.

## Impact Areas

- API/OpenAPI: no
- DB/Prisma/migrations: no
- Auth/session/RBAC: no
- Queue/jobs: no
- Env/config/secrets: yes
- Observability/logging/tracing: no
- External integrations: yes
- CI/release/harness: yes

## Acceptance Criteria

1. The attempted design and verification evidence remain discoverable.
2. The document clearly marks the architecture as rejected before commit.
3. Future agents are directed to the current-session correction.

## Implementation Checklist

- [x] Implement and evaluate the initial nested-agent interpretation.
- [x] Run deterministic and runtime verification against that interpretation.
- [x] Record the owner's correction before any Phase 4 commit.
- [x] Supersede the design with the current-session agent harness plan.

## Decision Log

- 2026-08-09: Initial implementation launched Codex CLI behind an agent-runtime
  port -> this followed the first proposal wording but split the user's active
  conversational context.
- 2026-08-09: Repository owner rejected the nested-agent boundary -> the current
  Codex conversation must remain the agent and call `backendkit` internally.
- 2026-08-09: Preserve this completed plan as superseded evidence -> avoids
  rewriting history while preventing future reuse of the rejected design.

## Verification

- The rejected implementation passed its focused harness suite and final fast
  profile before correction.
- Canonical task verification reached `ready_for_review` after `full` and
  isolated `runtime` lanes passed.
- A disposable nested Codex smoke produced no candidate because the inner
  sandbox could not initialize in the already managed environment. This exposed
  the product and architectural mismatch; no application source was modified.

## Runtime Evidence

- Artifact path:
  `.tmp/backendkit/tasks/isolated-agent-execution-20260809/episodes/attempt-3.json`.
- The temporary Compose project and disposable Git fixture were removed.
- Existing user-owned Docker volumes and `_WIP` files were not deleted.

## Risks And Mitigations

- Risk: a future agent treats this plan as current guidance.
  Mitigation: title, objective, completion notes, ADR 0022, and the corrective
  plan all explicitly mark the design as superseded.

## Completion Notes

The nested-agent implementation was never committed. It was removed and
replaced by a smaller current-session workspace harness: repository code owns
authority, Git workspace identity, verification, and evidence, while the active
Codex conversation remains the sole coding agent.

## Follow-Ups

- [ ] Follow `2026-08-09_current-session-agent-harness.md` for the accepted
      Phase 4 implementation and evidence.
