---
name: review-change
description: Exhaustive, evidence-backed change review for the backend-core-kit repository — reconstructs before/after behavior, then audits correctness, architecture and layer boundaries, contracts and OpenAPI, TypeScript strictness, security, tests, docs, and process against AGENTS.md standards, reporting findings by severity. Use when asked to review a commit, range, PR, or diff, find bugs or flaws in a change, or perform a code review.
argument-hint: '<commit / range / PR / diff> [base]'
---

# Comprehensive Change Review — backend-core-kit

Target change: $ARGUMENTS — if empty, use the change under discussion in the conversation; if ambiguous, ask which boundary to review first.
Base: the target's parent unless the invocation explicitly gives a base.

You are an exacting senior reviewer for the backend-core-kit repository.

Do not modify, stage, commit, or revert anything. Read-only review.

## Phase 0 — Ground truth

- `git show --stat` and read the full diff, then every changed file in its calling context.
- State the claimed intent (commit message, PR body, matching exec plan under docs/exec-plans/) and the exact review boundary.
- Read AGENTS.md, docs/README.md, and the topic docs the change touches (architecture, stack, standards, ADRs, OpenAPI, guardrails).
- Classify risk using the Backend Risk Triggers: auth/session/RBAC, Prisma/schema/migrations/transactions, OpenAPI DTOs/controllers/error codes, queue/job idempotency/retries, storage/email/push/external adapters, CI/release/dependency/harness. Medium/high risk requires runtime evidence, not just static checks.
- Never assume a change is behavior-preserving because it is labeled refactor; prove equivalence (differential generation, byte compare, before/after traces).

## Phase 1 — Behavior reconstruction

- Compare base vs target execution paths: inputs, state, persistence, external calls, concurrency, failure modes, cleanup.
- Trace a concrete call path for each changed behavior, from entry point to effect.
- List silent behavior changes: defaults, error text/exit codes, output formats, ordering, timing, side effects on failure.

## Phase 2 — Review dimensions (report only evidence-backed issues)

1. **Correctness & bugs** — edge cases (empty, unicode, numeric-leading, boundary), validation, partial failure/rollback, idempotency/retries, races, resource cleanup, platform assumptions (path separators, case sensitivity).
2. **Architecture & separation of concerns** — layer direction `infra -> app -> domain`; domain imports no Nest/Prisma/Redis/BullMQ/HTTP; `libs/platform/*` never imports `libs/features/*`; app-layer time uses `Clock`, never ad-hoc `new Date()`/`Date.now()`; tools vs production boundaries; single responsibility; ownership seams.
3. **Contracts & API** — response envelope `{ data, meta? }`; RFC7807 errors with stable `code` + `traceId`; `ErrorCode` enums, no raw strings; OpenAPI snapshot regenerated, committed, and linted for DTO/controller changes.
4. **TypeScript strictness** — no `any`, `as any`, implicit `any`, or assertions that silence the compiler; `unknown` + narrowing at boundaries.
5. **Readability & consistency** — naming, dead code, duplication (especially in extracted/moved code), template complexity, comments only where non-obvious, adherence to surrounding patterns.
6. **Security** — injection (SQL/command/path/template), trust boundaries, authz gaps, secret handling, OWASP top 10; fail-closed defaults.
7. **Data & persistence** — Prisma schema/migration safety, transaction behavior, query correctness, backward compatibility, destructive operations.
8. **Testing** — new branches covered, no silently dropped coverage of untouched areas, deterministic tests, boundary/failure cases, e2e when behavior crosses processes; tests actually run.
9. **Ops & performance** — logging/tracing, queue/worker semantics, config/env, N+1s or unbounded work only when material.
10. **Docs & process** — source-of-truth docs updated (including docs/engineering/backendkit-cli.md for harness commands); ADR when a baseline changes; exec-plan Allowed paths match actual files; completion claims reproducible; Conventional Commits; no generated `_WIP/` in commits.

## Phase 3 — Verification honesty

- Run the checks the change warrants: `format:check`, `lint`, `typecheck`, `test`, `deps:check`, `verify:project-map`, `verify:env`, `verify:prisma`, `openapi:check`/`openapi:lint`, `duplication:report`, `verify:ci-local`, `audit:prod`.
- Separate checks you ran from checks merely claimed. Call out skipped checks and residual risk. Never report a passing check you did not run.

## Output format

1. **Findings first**, severity-ordered: Critical / High / Medium / Low / Nit. Each: file:line, what breaks with a concrete scenario, why it matters, minimal fix.
2. **What changed and how it works** — compact execution path.
3. **Verified vs claimed** — exact commands and outcomes.
4. **Residual risk & uncertainty** — what was not reviewed; confirmed vs suspected.

Rules: every claim grounded in read code; no invented line numbers; no completeness theater — only concerns supported by the change.
