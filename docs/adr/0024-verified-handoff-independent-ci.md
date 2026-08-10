# ADR: Verified Handoff And Independent CI

- Status: Accepted
- Date: 2026-08-10
- Decision makers: Core kit maintainer

## Context

The harness can authorize, isolate, and verify work, but `ready_for_review`
only proves that a local episode passed. It does not prove that the candidate is
still unchanged, authorize an external mutation, or provide independent
clean-checkout evidence. A safe handoff needs narrow publication adapters and
hosted CI that does not trust controller-local state.

## Decision

- Add `backendkit handoff dry-run` for `commit`, `push`, and `draft-pr`. It
  revalidates the task, latest successful episode, current fingerprint,
  workspace, branch, remote, and exact task-owned paths.
- A dry-run prepares one action-scoped approval that expires after 15 minutes.
  The repository stores only its hash in strict mode-0600 local state. The
  repository cannot authenticate who supplied the approval, so the current
  agent may invoke the mutating command only after explicit user authorization.
- Commit stages only the verified task paths and requires exact staged-set
  equality. Push uses a normal explicit branch ref and exposes no force option.
  PR creation is draft-only with explicit repository, head, base, title, and a
  sanitized body.
- Commit, push, and draft PR are separate grants and separate approvals.
  Merge, deploy, migration, branch deletion, force push, and marking a PR ready
  are not publication adapter capabilities.
- Persist `executing` before an external mutation. If it throws or is
  interrupted, mark the outcome `uncertain` and require manual reconciliation;
  never automatically replay it.
- Split hosted CI into stable `CI Risk`, `CI Full`, conditional `CI Runtime`,
  `CI Governance`, and aggregate `CI Required` jobs.
- Classify the clean base/head diff using conservative path rules plus every
  changed V2 plan's declared risk and impacts. Invalid changed V2 plans fail
  closed.
- Hosted jobs use canonical npm profile aliases from a clean checkout. Local
  episodes and diagnostics are not pass evidence and are never uploaded.
- Pin every third-party action to a reviewed full commit SHA, disable persisted
  checkout credentials, use read-only workflow permissions, bound job duration,
  and always tear down runtime dependencies.

## Rationale

Freshness and authority are different concerns. Rechecking freshness prevents
publishing stale evidence; action-scoped user authorization prevents local task
state from silently becoming external authority. A fail-closed uncertain state
avoids duplicate commits, pushes, or PRs after ambiguous interruption.

Independent CI lanes make failures attributable while the aggregate check gives
branch protection one stable status. Calling canonical profiles prevents local
and hosted verification semantics from drifting.

## Consequences

- Publication requires a reviewable dry-run immediately before every action.
- An expired approval, changed candidate, changed remote, pre-staged content, or
  mismatched episode requires a new dry-run.
- Ambiguous external outcomes require human inspection of Git and GitHub state.
- Clean hosted CI does not consume `.tmp/backendkit/` state; workflow logs and
  approved coverage/runtime artifacts are independent evidence.
- The initial push of a repository without a parent commit is unsupported by
  the current base/head classifier and fails closed.

## Alternatives Considered

- Treat `ready_for_review` as commit/push authority: rejected because local
  verification status is not user authorization for an external mutation.
- Use one approval for all publication steps: rejected because review of a
  commit does not imply authority to push or create a PR.
- Retry failed external commands automatically: rejected because their outcome
  may already have occurred remotely.
- Keep one monolithic CI job: rejected because runtime selection and failure
  attribution would remain opaque.
- Pin actions to movable major tags: rejected because tags are not immutable.

## Links / References

- `docs/adr/0020-structured-task-authority.md`
- `docs/adr/0021-risk-aware-verification-repair.md`
- `docs/adr/0022-isolated-agent-execution.md`
- `docs/engineering/backendkit-cli.md`
- `docs/engineering/agent-pr-loop.md`
- [GitHub: Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub CLI: `gh pr create`](https://cli.github.com/manual/gh_pr_create)
