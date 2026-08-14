# Development Workflow

This document defines the expected development workflow for projects using this core kit.

## Day-to-Day Commands (Expected)

These are the typical commands a project should provide:

- `npm run deps:up` (local Postgres + Redis via Docker Compose)
- `npm run lint`
- `npm run format`
- `npm run typecheck`
- `npm run verify:env` (env example/schema drift)
- `npm run deps:check` (dependency boundaries + cycles)
- `npm test`
- `npm run test:int`
- `npm run test:e2e`
- `npm run verify:e2e` (deps + migrations + integration + e2e)
- `npm run verify:gates` (meta: ensure OpenAPI/deps gates fail when broken)
- `npm run openapi:generate` (or similar)
- `npm run openapi:lint` (Spectral)
- `npm run start:dev` (API)
- `npm run start:worker:dev` (worker)
- `npm run verify:ci-local` (non-Docker CI mirror)
- `npm run verify:ci` (canonical full + runtime profile used by hosted CI)
- `npm run duplication:report` (categorized duplication self-review reports)

The stable verification aliases are composed by the repository-local
`backendkit` CLI. See `docs/engineering/backendkit-cli.md`. When code is
scaffolded, keep these commands stable; they form the project’s “golden path”.

For a non-trivial controller-managed task, create a V2 execution plan and run
`npm run backendkit -- task begin --plan <path>` before edits. Run
`npm run backendkit -- task preflight --task <task-id> --action verify` before
the verification profile.

For baselined V2 work, prefer `npm run backendkit -- task verify --task
<task-id>` so effective risk, runtime impact, attempts, repair decisions, and
sanitized evidence stay attributable.

For isolated implementation, the current Codex agent internally runs `task
workspace prepare --task <id>`, then uses the returned linked worktree for
ordinary tool calls. `task workspace status` rediscovers that workspace after
context compaction; cancel and cleanup are explicit task-state operations.
Repository tooling never launches another agent or authorizes publication.

For approved queued work, the current agent or an external scheduler may invoke
`events run --once`. This activates at most one queued plan and returns an
authorized task; it does not start Codex. Scheduled repository observations use
`maintenance run --once`, which has a fixed command registry and may refresh
the existing `_WIP` reports but never edits source or grants task authority.

## PR Expectations

- Keep PRs small and scoped.
- Update docs when behavior changes (especially API contracts and error codes).
- If you introduce a new pattern: add an ADR in `docs/adr/`.

## Contract Discipline (Non-Negotiable)

Every PR must keep these gates green:

- OpenAPI snapshot is up-to-date and committed.
- Spectral lint passes.
- Error codes documented via `x-error-codes`.

## Release Hygiene (Baseline)

Even if automation is added later, design for:

- immutable builds
- environment-driven configuration
- migration strategy (`prisma migrate deploy` gated)
