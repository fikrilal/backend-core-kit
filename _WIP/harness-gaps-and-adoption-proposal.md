# Backend Harness Gap Review Against Mobile Core Kit

Date: 2026-06-04
Scope: `backend-core-kit` developer harness, CI gates, agent workflow
Comparison target: `/home/fikrilal/devs/core/mobile-core-kit`
Status: Verified proposal
Last updated: 2026-06-04

## Executive Summary

`backend-core-kit` already has a serious harness: strict TypeScript, dependency-cruiser boundaries, OpenAPI snapshot and Spectral gates, architecture smell scanning, scaffold smoke checks, gate-honesty checks, Docker-backed integration/e2e verification, and concise agent-facing repo guidance.

`mobile-core-kit` is still more mature in one important dimension: it treats repeated agent failure modes as first-class harness artifacts. The mobile repo has a canonical verification orchestrator, richer repo-specific static checks, duplication profiles with allowlists, explicit risk/evidence workflow docs, secret scanning, coverage/golden gates, and project-map drift detection.

The backend should not blindly port mobile scripts. It should adopt the underlying harness patterns in backend-native form.

## Method

Reviewed backend:

- `AGENTS.md`
- `package.json`
- `.github/workflows/ci.yml`
- `.github/pull_request_template.md`
- `.dependency-cruiser.cjs`
- `.spectral.yaml`
- `eslint.config.mjs`
- `scripts/architecture-smells.ts`
- `scripts/gates-honesty.ts`
- `scripts/scaffold-smoke.ts`
- `scripts/openapi-check.ts`
- `scripts/verify-e2e.ts`
- `tools/scaffold-feature.ts`
- `docs/standards/*`
- `docs/guide/*`

Reviewed mobile:

- `AGENTS.md`
- `tool/verify.dart`
- `tool/verify_*.dart`
- `tool/check_*duplication.sh`
- `.jscpd*.json`
- `tool/*duplication_allowlist.json`
- `tool/filter_duplication_report.dart`
- `tool/lints/architecture_lints.yaml`
- `packages/mobile_core_kit_lints/*`
- `.github/workflows/governance.yml`
- `.github/workflows/android.yml`
- `.github/actions/flutter-bootstrap/action.yml`
- `.github/pull_request_template.md`
- `docs/engineering/agent_pr_loop.md`
- `docs/engineering/guardrails.md`
- `docs/engineering/duplication_harness.md`
- `docs/engineering/mobile_runtime_harness.md`
- `docs/engineering/parallel_agent_workflow.md`
- `docs/exec-plans/README.md`

Sanity checks run on backend:

```bash
npm run smells:arch -- --report /tmp/backend-core-kit-architecture-smells.md --json /tmp/backend-core-kit-architecture-smells.json
```

Result: `0` architecture smell findings under current rules.

Also searched backend source for raw Nest HTTP exceptions and raw numeric status decorators. Raw exception usage was not found in production source; raw numeric `@HttpCode(200|204)` decorators are present in feature controllers.

## What Backend Already Does Well

### Strong existing harness

- `npm run verify` provides a stable local gate for format, lint, typecheck, dependency boundaries, unit tests, OpenAPI snapshot, and OpenAPI lint.
- CI also runs scaffold smoke, architecture smell scan, gate honesty, Docker dependencies, migrations, integration tests, and e2e tests.
- `scripts/gates-honesty.ts` is a high-value meta-harness: it proves OpenAPI and dependency-boundary gates still fail on known-bad states.
- `scripts/scaffold-smoke.ts` validates that generated features pass lint, typecheck, and dependency boundaries.
- `.dependency-cruiser.cjs` enforces backend architecture boundaries mechanically.
- `.spectral.yaml` enforces `operationId`, tags, and `x-error-codes`.
- `scripts/architecture-smells.ts` has a baseline model and blocks baseline updates without explicit approval.
- `tools/scaffold-feature.ts` gives new features a consistent starting shape with app ports, typed error codes, injected `Clock`, DTOs, error filters, optional queue skeletons, and TODO tests.

### Backend advantages over mobile

- Backend has stronger API contract harnessing through OpenAPI snapshot plus Spectral.
- Backend has stronger boundary gate-honesty checks.
- Backend has real Postgres/Redis/MinIO integration and e2e gates in CI.
- Backend already has an architecture smell baseline governance model.

## Current Completion Status

- Done: secret scanning CI gate (`.github/workflows/governance.yml`; commit `e7b05cd`).
- Done: static `env.example` schema validation (`scripts/verify-env-example.ts`, `npm run verify:env`, CI wiring; commit `fb4a114`).
- Done: scoped semantic commit-message harness (`commitlint.config.cjs`, `.githooks/commit-msg`, `npm run setup:hooks`; commit `ccfce72`).
- Done: canonical non-Docker CI mirror (`scripts/verify-ci-local.ts`, `npm run verify:ci-local`).
- Done: backend duplication report harness (`jscpd`, two profiles, categorized filter, allowlists, docs).
- Done: HTTP/error/time policy guard expansion (`scripts/architecture-smells.ts`) and raw `@HttpCode` cleanup.
- Done: guardrails, agent PR loop, parallel-agent workflow, and execution-plan docs.
- Done: PR template risk/evidence upgrade.
- Done: project-map drift verification (`scripts/verify-project-map-drift.ts`, `npm run verify:project-map`).
- Done: unit coverage visibility (`npm run test:coverage`, CI coverage artifact; no threshold yet).
- Done: Prisma schema/generation and migration-status drift checks.
- Done: backend runtime evidence guide.

## Verified Gaps And Recommendations

### P0: Add a canonical verify orchestrator

Status: Done.

Implemented:

- Added `scripts/verify-ci-local.ts`.
- Added `npm run verify:ci-local`.
- Kept `npm run verify` as the fast local gate.
- Kept `npm run verify:e2e` as the explicit Docker-backed lane.

Mobile has `dart run tool/verify.dart --env dev`, which is the single command agents and CI can reason about. Backend has several scripts and `npm run verify`, but `verify` does not include some CI-only gates:

- `scaffold:smoke`
- `smells:arch:ci`
- `verify:gates`
- `audit:prod`
- deps-backed `verify:e2e`

Recommendation:

- Keep `npm run verify` as the fast canonical local gate.
- Add `npm run verify:ci-local` or `scripts/verify.ts` to mirror the non-Docker CI sequence:
  - `prisma:generate`
  - `format:check`
  - `lint`
  - `typecheck`
  - `deps:check`
  - `scaffold:smoke`
  - `smells:arch:ci`
  - `test`
  - `openapi:check`
  - `openapi:lint`
  - `verify:gates`
  - `audit:prod`
- Keep `npm run verify:e2e` as the explicit Docker-backed lane.

Why:

- Agents need one authoritative command for “did I satisfy the harness?”
- CI/local drift is a recurring source of weak verification claims.

### P0: Add secret scanning to actual CI

Status: Done.

Implemented:

- Added `.github/workflows/governance.yml`.
- Uses `gitleaks/gitleaks-action@v2`.
- Runs on `pull_request`, `push` to `main`, and `workflow_dispatch`.
- Uses least-privilege `contents: read` and full checkout history.

Backend docs already list pre-merge secret scanning as a baseline security gate in `docs/standards/ci-cd.md`, but `.github/workflows/ci.yml` does not include gitleaks or an equivalent.

Mobile has a dedicated gitleaks job in `.github/workflows/governance.yml`.

Recommendation:

- Add gitleaks to backend CI.
- Prefer a separate governance workflow, or add a `Secret scan (gitleaks)` step before build/test gates.
- Ensure it runs on PRs and pushes to main.

Why:

- This is already documented as expected backend behavior.
- Backend has many high-risk env surfaces: JWT signing keys, OTLP auth headers, Resend, FCM, S3 credentials, DB/Redis URLs.

### P0: Add static env example/schema validation

Status: Done.

Implemented:

- Added `scripts/verify-env-example.ts`.
- Added `npm run verify:env`.
- Wired `verify:env` into `npm run verify`.
- Added CI step after typecheck.
- Updated configuration/CI/development docs.
- Cleaned optional push/storage examples in `env.example` so the example passes the runtime schema.

Backend validates env at startup through `libs/platform/config/env.validation.ts`, but it does not statically verify `env.example` during the normal harness.

Mobile has `tool/verify_env_schema.dart` and validates all env files before generating build config.

Backend-native recommendation:

- Add `scripts/verify-env-example.ts`.
- Parse `env.example` with `dotenv`.
- Reuse `validateEnv(...)` and existing invariant checks.
- Verify:
  - `env.example` parses cleanly
  - values satisfy schema types/ranges
  - staging/production invariants can be checked with documented overrides or a dedicated production example path if needed
  - no required schema key is undocumented in `env.example`
  - no stale key exists in `env.example` without a matching `EnvVars` property, unless explicitly allowlisted
- Add to `verify:ci-local` and CI.

Why:

- Runtime validation catches bad app boot, but it does not catch drift between `EnvVars`, docs, and `env.example` until a human tries to use it.
- This is cheap and deterministic.

### P1: Add backend duplication harness with profiles and allowlists

Status: Done.

Implemented:

- Added `jscpd` as a dev dependency.
- Added core and small-helper profiles (`.jscpd.json`, `.jscpd.small-helpers.json`).
- Added `scripts/filter-duplication-report.ts`.
- Added reviewed-acceptable allowlists:
  - `tools/duplication-allowlist.json`
  - `tools/small-helper-duplication-allowlist.json`
- Added `npm run duplication:core`, `npm run duplication:small-helpers`, and `npm run duplication:report`.
- Wired `duplication:report` into `npm run verify:ci-local` as a non-fatal self-review report gate.
- Added `docs/engineering/duplication-harness.md`.

The previous draft was directionally right but too shallow. Mobile does not just “run jscpd.” It has:

- a core duplication profile
- a small-helper profile
- a presentation profile
- repo-specific report filtering
- categorized duplicate groups
- reviewed-acceptable allowlists with rationale
- docs explaining how to interpret the signal

Backend currently has `scripts/architecture-smells.ts`, which catches curated smell patterns. That should remain. It is not a replacement for token-based clone detection.

Backend-native recommendation:

- Add `jscpd` as a dev dependency.
- Add two initial profiles, not three:
  - core backend duplication profile
  - small-helper duplication profile
- Scan likely high-ROI paths:
  - `libs/features`
  - `libs/platform`
  - `libs/shared`
  - optionally `apps/worker/src/jobs`
- Ignore:
  - generated output
  - `*.spec.ts`, `*.test.ts`, `test/**` initially
  - migrations
  - OpenAPI snapshot
- Add `scripts/filter-duplication-report.ts`.
- Add `tools/duplication-allowlist.json` and `tools/small-helper-duplication-allowlist.json`.
- Start as a self-review / report gate, then fail CI only on selected categories after tuning.

Backend categories worth detecting:

- error/problem mapping duplication
- Prisma query builder duplication
- cursor/filter/sort helper duplication
- rate limiter helper duplication
- transaction retry helper duplication
- queue job envelope/idempotency helper duplication
- request trace fallback duplication
- date/time parsing and normalization helper duplication
- DTO-to-view mapper duplication

Why:

- Agent-generated backend code often duplicates mappers, query builders, retry classifiers, and small validators.
- Raw clone output will be noisy. A categorized filter plus allowlist is the important part to port.

### P1: Extend backend policy guards for HTTP/error/time hygiene

Status: Done.

Implemented:

- Added `raw_http_code_decorator` high-severity guard.
- Added `native_http_exception_in_feature` high-severity guard.
- Added `feature_controller_missing_api_error_codes` medium-severity guard.
- Added `worker_wall_clock_usage` medium-severity review guard for worker handlers.
- Replaced existing raw `@HttpCode(200|204)` usages with `HttpStatus.OK` / `HttpStatus.NO_CONTENT`.
- Current architecture smell report has no high findings and 7 medium worker clock review findings.

Backend already has ESLint rules for no `any`, no type assertions, no console, and no app-layer `new Date()` / `Date.now()`. The current architecture smell scanner also catches raw error code literals in production source.

Gaps found:

- Raw numeric `@HttpCode(200|204)` exists in feature controllers.
- Raw Nest HTTP exceptions are not currently present in production source, but there is no guard preventing them.
- Worker/job code still has wall-clock calls. Some may be appropriate, but the policy boundary is less explicit than app services.

Recommendation:

- Extend `scripts/architecture-smells.ts` or ESLint with:
  - `raw_http_code_decorator`: prefer `HttpStatus.OK`, `HttpStatus.NO_CONTENT`, etc.
  - `native_http_exception_in_feature`: block `BadRequestException`, `NotFoundException`, `ForbiddenException`, etc. in feature/platform code where `ProblemException` or feature errors should be used.
  - `feature_controller_missing_api_error_codes`: optional AST/string check to catch routes missing `@ApiErrorCodes` before Spectral catches generated OpenAPI.
  - `worker_wall_clock_usage`: report `new Date()` / `Date.now()` in worker handlers for review, with allowlist or explicit `Clock` injection guidance.
- Clean existing raw `@HttpCode` usages or baseline them before making the rule fatal.

Why:

- The backend already has strong standards, but some are only documented or enforced indirectly.
- Backend agents should get remediation instructions directly from failing gates, not reviewer memory.

### P1: Add guardrails and agent PR loop docs

Status: Done.

Implemented:

- Added `docs/engineering/guardrails.md`.
- Added `docs/engineering/agent-pr-loop.md`.
- Added `docs/engineering/parallel-agent-workflow.md`.
- Added execution plan structure:
  - `docs/exec-plans/README.md`
  - `docs/exec-plans/_template.md`
  - `docs/exec-plans/active/.gitkeep`
  - `docs/exec-plans/completed/.gitkeep`
  - `docs/exec-plans/tech-debt-tracker.md`
- Updated `AGENTS.md`, `docs/README.md`, and `docs/engineering/README.md` to point at the workflow docs.

Mobile has explicit docs for:

- guardrails and when to add one
- agent PR loop
- duplication harness
- runtime evidence
- parallel-agent workflow
- execution plans

Backend has strong standards and guides, but less explicit agent operating workflow beyond `AGENTS.md`.

Recommendation:

- Add `docs/engineering/guardrails.md`.
- Add `docs/engineering/agent-pr-loop.md`.
- Add `docs/engineering/parallel-agent-workflow.md`.
- Add `docs/exec-plans/README.md`, `active/`, `completed/`, and a tech debt tracker if the team wants plans checked into the repo.
- Update `AGENTS.md` to point to these docs without bloating it.

Backend-specific PR loop should include:

- risk class
- acceptance criteria
- API/OpenAPI impact
- DB/Prisma/migration impact
- auth/session/RBAC impact
- queue/job impact
- verification commands and outcomes
- runtime evidence when static checks are insufficient

Why:

- Harness engineering is not only code gates. It is making agent work legible, repeatable, and reviewable.
- Backend changes often touch auth, persistence, queues, or API contracts; risk classification should be explicit.

### P1: Upgrade PR template risk/evidence expectations

Status: Done.

Implemented:

- Added risk class checkboxes.
- Added acceptance criteria.
- Added backend impact areas.
- Added exact command outcome expectations.
- Added evidence fields for API contract diffs, migrations, integration/e2e, logs/traces, queue/jobs, and config/env.
- Preserved backend-specific architecture smell, duplication, OpenAPI, and error-code sections.
- Added reviewer focus and no-speculative-refactor expectations.

Backend PR template currently asks for summary, phase task IDs, architecture smell impact, OpenAPI/error-code impact, verification, and rollback.

Mobile PR template is stronger on:

- risk class
- acceptance criteria
- exact checks and outcomes
- evidence expectations
- reviewer focus

Recommendation:

- Add risk class checkboxes.
- Add acceptance criteria.
- Require exact command outcomes, not only checked boxes.
- Add evidence fields for:
  - API contract diffs
  - migration status
  - integration/e2e evidence
  - logs/traces for runtime-sensitive changes
- Keep architecture smell and OpenAPI sections because those are backend-specific strengths.

Why:

- Backend’s current template is good for phase work but weaker for standalone PR review and agent-delivered evidence.

### P2: Add project-map drift verification

Status: Done.

Implemented:

- Added `scripts/verify-project-map-drift.ts`.
- Added `npm run verify:project-map`.
- Wired project-map drift verification into `npm run verify:ci-local`.
- Checks required AGENTS layout paths exist and are documented.
- Checks `docs/README.md`, `docs/adr/README.md`, and `docs/standards/README.md` linked doc paths exist.
- Checks ADR and standards indexes enumerate committed markdown files in their directories.
- Expanded ADR and standards indexes so the check has a complete source of truth.

Mobile has `tool/verify_project_map_drift.dart`, which checks that `AGENTS.md` project map does not drift from actual source layout.

Backend `AGENTS.md` has a concise repository layout, but no drift check.

Recommendation:

- Add `scripts/verify-project-map-drift.ts`.
- Check at least:
  - documented top-level layout exists: `apps/api`, `apps/worker`, `libs/platform`, `libs/features`, `docs`
  - `docs/README.md` links exist
  - ADR index links exist
  - standards index links exist
- Add to `verify:ci-local`.

Why:

- Backend depends heavily on repo-local docs as source of truth.
- Stale maps harm agent legibility.

### P2: Add coverage visibility, then a conservative floor

Status: Done for visibility; threshold intentionally deferred.

Implemented:

- Added `npm run test:coverage`.
- Configured Jest coverage reporters: text summary, lcov, and json summary.
- Excluded tests, DTOs, generated declarations, module wiring, token/type-only files, and generated folders from unit coverage collection.
- Changed `npm run verify:ci-local` unit-test step to run coverage once instead of running tests twice.
- Changed CI unit-test step to `npm run test:coverage`.
- Added CI upload for the `coverage/` artifact.
- Documented that no threshold is enforced until baseline signal is measured.

Mobile governance includes a coverage gate with a floor.

Backend has unit/integration/e2e gates but no coverage reporting or threshold.

Recommendation:

- First add coverage artifact/reporting for unit tests.
- Exclude generated/DTO/migration/OpenAPI files.
- Only add a threshold after measuring baseline.
- Start with a conservative floor to avoid incentivizing low-value tests.

Why:

- Coverage should reveal test blind spots, not become a vanity metric.
- Backend already has behavior-heavy e2e coverage; line coverage alone will be incomplete.

### P2: Add Prisma schema/migration drift checks

Status: Done.

Implemented:

- Added `scripts/verify-prisma-drift.ts`.
- Added `npm run verify:prisma`.
- Added `npm run prisma:validate`.
- Added `npm run prisma:migrate:status`.
- Wired `verify:prisma` into `npm run verify:ci-local`.
- Replaced CI's standalone Prisma generate step with `npm run verify:prisma`.
- Added `prisma:migrate:status` before `prisma:migrate:deploy` in CI and `npm run verify:e2e`.
- Documented Prisma drift policy in database/CI/guardrail docs.

The previous draft correctly identified this as a gap, but `prisma migrate status` alone is not enough for every local/CI mode.

Recommendation:

- Add a deterministic migration/schema check script:
  - run `prisma validate`
  - verify `prisma generate` does not produce dirty tracked generated output if any generated artifacts are committed
  - in Docker-backed lane, run `prisma migrate status` and `prisma migrate deploy`
  - optionally compare migration history against schema with a shadow DB in a dedicated CI lane
- Wire lightweight validation into `verify:ci-local`.
- Keep DB-backed migration status in `verify:e2e` or CI.

Why:

- Backend API and persistence changes are high production-risk.
- Drift should be caught before a deploy lane.

### P3: Add backend runtime evidence guidance

Status: Done.

Implemented:

- Added `docs/engineering/backend-runtime-evidence.md`.
- Defined when runtime evidence is expected.
- Defined acceptable evidence types for full e2e gates, targeted integration/e2e commands, HTTP transcripts, queue/worker state, migrations, observability, and API contract diffs.
- Added risk-class evidence expectations and redaction rules.
- Linked the guide from `AGENTS.md`, `docs/README.md`, `docs/engineering/README.md`, `docs/engineering/agent-pr-loop.md`, and the PR template.

Mobile has a runtime harness because device behavior is hard to prove statically. Backend has e2e tests and local dependency scripts, but lacks a comparable evidence guide for runtime-sensitive backend changes.

Recommendation:

- Add `docs/engineering/backend-runtime-evidence.md`.
- Define when evidence is expected:
  - auth/session/RBAC changes
  - queue/worker changes
  - idempotency/rate-limit behavior
  - observability/logging/tracing behavior
  - performance/startup/readiness changes
- Define acceptable evidence:
  - exact `npm run verify:e2e` result
  - targeted e2e/integration command
  - curl/http transcript for a changed endpoint
  - relevant structured log snippets
  - queue job state evidence
  - OpenAPI diff

Why:

- Static gates do not prove runtime behavior for queues, Redis, Postgres, and observability.

## Proposed Adoption Order

1. Add secret scanning to CI.
2. Add static `env.example` validation.
3. Add scoped semantic commit-message harness.
4. Add `verify:ci-local` or `scripts/verify.ts` as the canonical non-Docker harness.
5. Extend architecture smell policy guards for raw `@HttpCode`, native HTTP exceptions, and selected worker time usage.
6. Add backend duplication harness profiles, filters, allowlists, and docs.
7. Upgrade PR template with risk, acceptance criteria, exact checks, evidence, and reviewer focus.
8. Add guardrails / agent PR loop / parallel-agent workflow docs.
9. Add project-map drift verification.
10. Add coverage reporting and eventually a conservative floor.
11. Add Prisma schema/migration drift checks beyond current migrate deploy usage.

## Notes On What Not To Port Directly

- Do not copy mobile UI token/modal checks literally. Backend equivalents are HTTP/error/time/config/DB/queue policy checks.
- Do not make raw jscpd output a hard CI gate. Filter it into backend-specific categories first.
- Do not add a coverage floor before measuring baseline.
- Do not make every wall-clock use illegal. Start by reporting worker/infra time usage and decide where `Clock` should be injected.
- Do not expand `AGENTS.md` into a long manual. Keep it as the operating map and link deeper docs.

## Bottom Line

Backend’s harness is already strong on architecture, API contracts, and real dependency verification. Mobile is more mature on agent-operational workflow, repo-specific static scans, duplication review, governance checks, and evidence discipline.

The best backend upgrade is not a broad port. It is to add backend-native guardrails for the same failure classes: stale config, leaked secrets, duplicated mappers/query helpers, raw transport policy escapes, stale docs maps, weak evidence, and local/CI verification drift.
