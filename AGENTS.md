# Repository Guidelines

## Operating Contract

- Keep changes small, focused, and reversible.
- Prefer the existing architecture, helpers, scripts, and standards over new patterns.
- Do not add speculative features, broad refactors, or flexible abstractions that are not required for the task.
- If behavior, architecture, standards, or public contracts change, update the relevant docs and add an ADR when the decision changes a baseline.
- Do not commit or push unless the user explicitly asks for a commit or push. Use Conventional Commits when committing.

## Source of Truth

Start with `docs/README.md`, then follow the topic-specific source:

- Architecture: `docs/core/project-architecture.md`
- Stack decisions: `docs/core/project-stack.md`
- Standards: `docs/standards/README.md`
- ADRs: `docs/adr/README.md`
- OpenAPI: `docs/openapi/README.md`
- Agent PR loop: `docs/engineering/agent-pr-loop.md`
- Runtime evidence: `docs/engineering/backend-runtime-evidence.md`
- Guardrails: `docs/engineering/guardrails.md`
- Parallel agents: `docs/engineering/parallel-agent-workflow.md`
- Execution plans: `docs/exec-plans/README.md`

## Hard Rules

- TypeScript is strict. Do not introduce `any`, `as any`, implicit `any`, or type assertions to silence the compiler.
- Use `unknown` plus validation/narrowing for unknown input.
- Respect dependency-cruiser boundaries. Do not shortcut imports across layers.
- API responses use the standard envelope: `{ data, meta? }`.
- API errors are RFC7807 problem details with stable `code` and `traceId`.
- OpenAPI snapshot changes must be generated, committed, and linted.
- App-layer time handling must use `Clock`; do not add ad-hoc `new Date()` or `Date.now()` in app services.
- Error codes must use `ErrorCode` and feature enums/unions; do not add raw production error-code strings.
- Secrets never go in git. Use env/runtime injection.

## Architecture Map

```text
apps/api/        # NestJS HTTP app bootstrap
apps/worker/     # BullMQ worker bootstrap
libs/platform/   # reusable platform modules: config, db, http, auth, queue, storage, etc.
libs/features/   # vertical slices: domain -> app -> infra
docs/            # standards, ADRs, contracts, engineering workflow
```

Layer direction inside a feature:

```text
infra -> app -> domain
```

- `domain`: pure rules; no Nest, Prisma, Redis, BullMQ, or HTTP imports.
- `app`: use cases and ports; no infra or framework details.
- `infra`: adapters, controllers, persistence, jobs; may depend on app/domain/platform.
- `libs/platform/*` must not depend on `libs/features/*`.

## Backend Risk Triggers

Treat these as medium/high-risk until proven otherwise:

- Auth/session/RBAC behavior
- Prisma schema, migrations, query builders, transaction behavior
- OpenAPI DTOs, controllers, error codes, response shape
- Queue/job idempotency, retries, Redis/BullMQ behavior
- Object storage, email, push notifications, external service adapters
- CI, release, dependency, or harness changes

For these changes, record exact verification commands and outcomes. Add runtime evidence when static checks do not prove behavior.

## Harness Expectations

- Prefer mechanical guardrails over reviewer memory.
- If a failure, review comment, or workflow gap repeats, promote it into a script, lint, template, scaffold, doc, or ADR.
- Keep naming stable and searchable so future agents can rediscover intent.
- For non-trivial work, create or follow an execution plan under `docs/exec-plans/active/`.
- For concurrent work, follow `docs/engineering/parallel-agent-workflow.md` and prefer one branch/worktree per agent.
- Keep generated `_WIP/` reports out of commits unless the user explicitly asks to keep them.

## Verification

Use the repo scripts in `package.json`; do not claim a check passed unless it was actually run.

Default local checks for most code changes:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`

Preferred non-Docker CI mirror:

- `npm run verify:ci-local`

Docker-backed deps lane:

- `npm run verify:e2e`

Run targeted checks when relevant:

- Env/schema docs: `npm run verify:env`
- Prisma schema/generation drift: `npm run verify:prisma`
- Dependency boundaries: `npm run deps:check`
- Project map/docs links: `npm run verify:project-map`
- OpenAPI after controller/DTO changes: `npm run openapi:generate`, then `npm run openapi:check` and `npm run openapi:lint`
- Duplication review for non-trivial backend code changes: `npm run duplication:report`
- Production dependency audit: `npm run audit:prod`

## Dependency Changes

- Prefer latest compatible current-major updates first.
- Do not run `npm audit fix --force` unless the user explicitly accepts breaking changes.
- If `npm audit` suggests a downgrade or major rollback, treat it as a finding to document, not an automatic fix.
- For dependency changes that alter implementation behavior, consult official upstream docs first when available.

## Delivery Notes

- Summarize changed files, behavioral impact, and verification evidence.
- Call out skipped checks and why.
- Call out residual risk, especially for auth, persistence, queues, OpenAPI, CI, and external services.
- Leave unrelated dirty worktree changes untouched.
- Leave completed work uncommitted by default; wait for an explicit user request before creating commits.
