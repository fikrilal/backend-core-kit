# Parallel Agent Workflow

This guide defines the safest way to run multiple AI agents in parallel on this
backend repository.

Goals:

- avoid cross-agent staging mistakes
- avoid mixed commits
- keep generated output attributable to the right task
- reduce verification noise

## Recommendation Order

Use these options in order:

1. `git worktree` plus one branch per agent
2. one branch per agent in separate clones
3. same branch in one working tree only as a last resort

The first option is the default recommendation.

## Preferred Setup: Git Worktrees

Use one worktree per task or agent so each agent gets:

- its own directory
- its own branch
- its own uncommitted working tree

Example:

```bash
git fetch origin

git worktree add ../backend-core-kit-auth -b agent/auth-policy
git worktree add ../backend-core-kit-queues -b agent/queue-cleanup
```

Then point each agent at a different directory:

- `../backend-core-kit-auth`
- `../backend-core-kit-queues`

Benefits:

- no accidental staging of another agent's files
- safer formatting, OpenAPI generation, Prisma generation, and verification
- easier review because each branch remains task-scoped

## High-Risk Shared Outputs

Coordinate ownership before multiple agents touch:

- `package.json` / `package-lock.json`
- `prisma/schema.prisma` and migrations
- `docs/openapi/openapi.yaml`
- `.github/workflows/**`
- `env.example`
- `AGENTS.md`
- `_WIP/*.md` generated reports
- `tools/**` guardrail baselines and allowlists

Only one agent should own a generated artifact at a time.

## Same Branch In One Working Tree: Risks

Running several agents against the same checked-out branch is possible, but it
is the highest-risk setup.

Main failure modes:

- one agent stages another agent's changes
- repo-wide formatting rewrites unrelated files
- OpenAPI/Prisma/report generation creates mixed diffs
- two agents edit the same controller, service, or docs section
- verification output becomes noisy because unrelated changes are mixed

Telling agents to avoid destructive git actions is necessary but insufficient.

## Minimum Rules For A Shared Working Tree

If multiple agents must share one working tree:

- assign explicit path ownership before work starts
- do not use `git add .`
- stage only explicit paths
- commit only explicit paths
- do not run repo-wide formatting unless requested
- do not run broad generation unless the task owns the generated output
- do not revert unrelated dirty files
- stop and report if another agent is editing the same file

Recommended pre-commit check:

```bash
git status --short
git diff --stat
```

## Branching Model

A practical model:

1. keep `development` as the local integration branch
2. create one branch per agent task
3. review each task branch
4. merge or cherry-pick reviewed commits into `development`

Example:

```bash
git switch development
git worktree add ../backend-core-kit-auth -b agent/auth-policy
git worktree add ../backend-core-kit-queues -b agent/queue-cleanup
```

After review:

```bash
git switch development
git merge --no-ff agent/auth-policy
git merge --no-ff agent/queue-cleanup
```

Use `git cherry-pick <sha>` when you want tighter commit selection.

## Verification Guidance

Each agent should verify in its own worktree.

Recommended flow per agent:

```bash
git status --short
npm run verify
```

Use `npm run verify:ci-local` when the task touches shared harness behavior, CI
gates, OpenAPI, scaffolding, or repo-level policy.

Use `npm run verify:e2e` only in the worktree that owns the dependency-backed
change.

## Decision Rule

Use `git worktree` when:

- more than one agent is active
- tasks may touch nearby feature boundaries
- formatting, OpenAPI generation, Prisma generation, or report generation is
  likely
- any task touches auth, persistence, queues, config, or CI

If overlapping edits in the same file are expected, do not share the same
working tree.
