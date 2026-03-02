# Enterprise Code Quality & Architecture Review

Date: 2026-03-02

## Scope and Evidence

- Reviewed `apps/*`, `libs/*`, `test/*`, and key docs/config (`docs/*`, CI workflow, scripts, Prisma schema).
- Executed gates:
  - `npm run verify` (pass)
  - `npm run smells:arch` (pass, `high=0, medium=7, low=12`)
  - `npm run audit:prod` (fail: 1 high + 1 critical)
  - `npm run verify:e2e` (fail in this environment: missing `DATABASE_URL` for Prisma migrate)

## Prioritized Findings

### High

1. Production dependency risk is currently above enterprise threshold.

- Evidence: runtime deps include AWS SDK + Prisma stack in [package.json](/home/fikrilal/devs/core/backend-core-kit/package.json:42); CI enforces audit in [ci.yml](/home/fikrilal/devs/core/backend-core-kit/.github/workflows/ci.yml:38).
- Evidence from run: `npm run audit:prod` reported `fast-xml-parser` (critical) and `minimatch` (high).
- Why this matters: known vulnerable transitive deps increase exploitability and can block releases under security policy.

2. The feature scaffold path is not architecture-safe, so “new feature by assembly” is currently unreliable.

- Evidence: generated app service template imports Nest in app layer (`@nestjs/common`) at [scaffold-feature.ts](/home/fikrilal/devs/core/backend-core-kit/tools/scaffold-feature.ts:207), violating feature app purity.
- Evidence: generated queue job id uses `:` at [scaffold-feature.ts](/home/fikrilal/devs/core/backend-core-kit/tools/scaffold-feature.ts:418), while existing code explicitly avoids `:` in BullMQ job ids.
- Why this matters: the default path for adding modules can generate code that immediately violates repo constraints and increases onboarding friction.

### Medium

1. Transaction retry policy has no backoff/jitter.

- Evidence: retries loop immediately on conflict at [tx-retry.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/db/tx-retry.ts:37).
- Why this matters: under contention, tight retries amplify DB pressure and reduce tail reliability.

2. Reliability standard requires explicit timeout posture, but platform defaults do not set explicit HTTP/Redis worker timeout policy.

- Evidence: Fastify adapter only sets trust/query parsing at [fastify-adapter.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/http/fastify-adapter.ts:35); Redis client uses defaults at [redis.service.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/redis/redis.service.ts:24); queue defaults set retries but no execution timeout at [queue.defaults.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/queue/queue.defaults.ts:3).
- Why this matters: timeouts are a core guardrail against stuck requests/jobs and cascading failure.

3. Auth orchestration manually constructs multiple services via `new` instead of DI composition.

- Evidence: [auth.service.ts](/home/fikrilal/devs/core/backend-core-kit/libs/features/auth/app/auth.service.ts:32).
- Why this matters: increases coupling, reduces substitutability, and makes extension/testing harder for the highest-risk feature.

4. Account deletion reminder scheduling can be spam-triggered.

- Evidence: reminder scheduling runs on every request at [user-account-deletion.controller.ts](/home/fikrilal/devs/core/backend-core-kit/libs/features/users/infra/http/user-account-deletion.controller.ts:72), and delay is clamped to `0` when reminder time is in the past at [user-account-deletion-email.jobs.ts](/home/fikrilal/devs/core/backend-core-kit/libs/features/users/infra/jobs/user-account-deletion-email.jobs.ts:59).
- Why this matters: repeated calls near deletion date can enqueue immediate reminders repeatedly.

5. Error code type hygiene is partially enforced, but base exception still allows arbitrary strings.

- Evidence: `code?: ErrorCode | string` at [problem.exception.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/http/errors/problem.exception.ts:10).
- Why this matters: allows accidental non-standard codes and contract drift across features.

6. Maintainability hotspots remain in key orchestration/repository files.

- Evidence: scan output `_WIP/architecture-smells.md` flags oversized and duplicated cursor logic in admin repos and worker files (for example [prisma-admin-audit.repository.ts](/home/fikrilal/devs/core/backend-core-kit/libs/features/admin/infra/persistence/prisma-admin-audit.repository.ts:1), [emails.worker.ts](/home/fikrilal/devs/core/backend-core-kit/apps/worker/src/jobs/emails.worker.ts:1)).
- Why this matters: these files are already doing too much and will become change-risk bottlenecks.

### Low

1. Repeated local normalizer helpers (`asNonEmptyString`) across modules.

- Evidence: scan output in `_WIP/architecture-smells.md` (12 occurrences).
- Why this matters: small drift/duplication cost; easy centralization win.

2. Password policy DTO constant reads directly from `process.env` at module load.

- Evidence: [password-policy.ts](/home/fikrilal/devs/core/backend-core-kit/libs/features/auth/infra/http/dtos/password-policy.ts:9).
- Why this matters: bypasses centralized config flow and can produce inconsistent behavior in atypical runtime/bootstrap order.

## Actionable Remediation Plan (Phased, Reversible)

### Phase 0 (Immediate: security + safe scaffolding)

1. Resolve `npm audit --omit=dev` high/critical findings with targeted package upgrades (`npm audit fix` where non-breaking, manual pin/bump where needed).
2. Fix scaffold templates to be boundary-compliant:

- app layer must be framework-free (remove `@Injectable` import/decorator from generated app service).
- use `queueName(...)`/`jobName(...)` helpers in generated queue files.
- replace `:` in generated `jobId` with safe separator.

3. Add a CI smoke test that runs scaffold in temp dir + `npm run lint && npm run typecheck && npm run deps:check` on generated files.

### Phase 1 (Reliability hardening)

1. Add explicit timeout config in platform:

- HTTP server/request/body limits in Fastify adapter.
- Redis client command/connect/retry options.
- queue/job timeout defaults where appropriate.

2. Add bounded retry backoff+jitter to `withTransactionRetry`.
3. Add tests proving timeout and retry behavior under failure paths.

### Phase 2 (Architecture simplification)

1. Decompose large files first:

- `emails.worker.ts`
- `prisma-admin-audit.repository.ts`
- `prisma-admin-users.repository.ts`

2. Extract shared cursor/filter builder utilities for admin repositories.
3. Replace manual `new` orchestration in auth app layer with explicit composition providers (keep pure classes, but assemble centrally).

### Phase 3 (Contract and assembly maturity)

1. Tighten `ProblemException` code typing to approved code unions only.
2. Introduce a shared “feature module recipe” (provider helpers + standard controller/filter/repo wiring) to reduce per-feature boilerplate.
3. Add an architecture-smell gate threshold for medium findings once current baseline is reduced.

## Done vs Not Done (Major Areas)

- Type safety (`strict`, no explicit `any`): **Done**.
- Boundary integrity (dep-cruiser rules): **Done** on current code.
- API contract gates (OpenAPI snapshot + Spectral): **Done**.
- Unit test suite and quality gates (`verify`): **Done** (passed locally).
- Integration/e2e golden path validation: **Not done in this run** (`verify:e2e` stopped at missing `DATABASE_URL`).
- Security baseline (dependency vulnerability posture): **Not done** (runtime audit currently fails).
- Reliability baseline (explicit timeout policy + jittered retries): **Partially done** (idempotency/retry patterns exist; timeout/backoff posture incomplete).
- “New modules mostly assembly” goal: **Not done** (scaffolder currently generates non-compliant patterns).

## Remaining Risks

- Release-blocking security advisories in runtime dependency tree.
- Reliability under contention/outage can degrade due immediate transaction retries and implicit timeout defaults.
- Velocity risk: new feature scaffolding can produce boundary violations and inconsistent queue conventions.

## Core/Shared Improvements to Make New Features Mostly Assembly

1. Make `tools/scaffold-feature.ts` generate only architecture-compliant code and testable stubs.
2. Promote shared cursor/filter primitives in `libs/shared/list-query` so feature repositories compose rather than copy.
3. Add a `libs/platform/feature-kit` module with standard provider bundles (clock token, feature error filter mapping, queue job id helpers).
4. Add a template-based “register module into app” script step to reduce manual wiring drift in `apps/api/src/app.module.ts`.
5. Add a CI contract test for scaffold output to enforce future consistency.
