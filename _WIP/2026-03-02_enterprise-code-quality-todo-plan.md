# Enterprise Code Quality Remediation TODO Plan

Date: 2026-03-02
Source: `_WIP/2026-03-02_enterprise-code-quality-review.md`

## Goals

- Remove current release blockers (security + architecture scaffolding issues).
- Improve reliability under load/failure (timeouts + retry behavior).
- Reduce change risk in hotspot modules.
- Make new feature/module delivery mostly assembly.

## Phase 0: Release Blockers (High)

### Security audit (runtime deps)

- [x] Run `npm audit --omit=dev --audit-level=high` and capture current baseline in `_WIP`.
- [x] Apply non-breaking fixes first: `npm audit fix`.
- [x] Manually upgrade/pin packages still affected (focus: `fast-xml-parser`, `minimatch`, impacted AWS/Prisma transitive paths).
- [x] Re-run `npm run verify` and `npm run audit:prod`.
- [ ] Document final dependency decisions/changelog in PR notes.

Current state:

- `npm audit --omit=dev --json` reports `high=0, critical=0` (remaining findings are `low/moderate`).

Done when:

- [x] `npm run audit:prod` passes.
- [x] `npm run verify` passes after dependency changes.

### Scaffold correctness (assembly path safety)

- [x] Update `tools/scaffold-feature.ts` to keep app layer framework-free (no Nest imports/decorators in `app/*`).
- [x] Update scaffold queue templates to use `queueName(...)` + `jobName(...)` utilities.
- [x] Replace generated `jobId` format to avoid `:`.
- [x] Add a script test that generates a temp feature and runs: `npm run lint && npm run typecheck && npm run deps:check`.

Implemented as:

- `npm run scaffold:smoke` (`scripts/scaffold-smoke.ts`)
- CI gate step in `.github/workflows/ci.yml`

Done when:

- [x] Fresh scaffold output passes lint/typecheck/dep boundaries without manual edits.

## Phase 1: Reliability Hardening (Medium)

### Timeout posture

- [x] Add explicit Fastify timeout/body-limit configuration in platform HTTP adapter.
- [x] Add explicit Redis connection/retry/command timeout policy in platform Redis service.
- [x] Add queue/job timeout defaults where appropriate.
- [x] Add tests validating timeout behavior and error shape.

### Transaction retry behavior

- [x] Add bounded exponential backoff + jitter to `withTransactionRetry`.
- [x] Ensure retry policy is configurable and test-covered.

Done when:

- [x] Reliability-related tests pass.
- [x] Timeout and retry behavior is documented in standards/guides.

Implemented in:

- `libs/platform/http/fastify-adapter.ts` + `libs/platform/http/fastify-adapter.spec.ts`
- `libs/platform/redis/redis.service.ts` + `libs/platform/redis/redis.service.spec.ts`
- `libs/platform/queue/queue.defaults.ts` + `libs/platform/queue/queue.worker.ts`
- `libs/platform/db/tx-retry.ts` + `libs/platform/db/tx-retry.spec.ts`
- docs: `docs/standards/reliability.md`, `docs/standards/configuration.md`, `docs/standards/queues-jobs.md`, `env.example`

Validation run:

- `npm run verify` ✅
- `npm run smells:arch` ✅ (`high=0, medium=7, low=12`)
- `DATABASE_URL=... REDIS_URL=... npm run verify:e2e` ✅

## Phase 2: Architecture Simplification (Medium)

### Decompose hotspot files

- [x] Split `apps/worker/src/jobs/emails.worker.ts` by job type/concern.
- [x] Split `libs/features/admin/infra/persistence/prisma-admin-audit.repository.ts` into query/filter/cursor builders + repository entry.
- [x] Split `libs/features/admin/infra/persistence/prisma-admin-users.repository.ts` similarly.

### Remove duplicated cursor logic

- [x] Extract shared cursor/filter helpers (likely under `libs/shared/list-query` or feature-local shared infra).
- [x] Replace duplicated local implementations in admin repositories.

Done when:

- [x] Architecture smell scan decreases medium findings for oversized/duplicate cursor builders.
- [x] Behavior and tests remain unchanged.

Validation run:

- `npm run verify` ✅
- `npm run smells:arch` ✅ (`high=0, medium=0, low=11`)
- `npm run verify:e2e` ⚠️ blocked locally (`DATABASE_URL` missing for `prisma migrate deploy`)

## Phase 3: Auth and Contract Hygiene (Medium)

### Auth orchestration composition

- [ ] Refactor `AuthService` composition so sub-services are injected/composed through provider wiring (not manual `new` chains in constructor).
- [ ] Keep app layer framework-free while improving substitutability and test seams.

### Error code typing hardening

- [ ] Tighten `ProblemException` code typing to approved code unions (remove open-ended `string` where possible).
- [ ] Add compile-time guardrails for feature/global code usage.

Done when:

- [ ] Auth service remains functionally identical with improved testability.
- [ ] Raw/unapproved error code drift is prevented by types/lint/tests.

## Phase 4: Functional Edge Cases (Medium)

### Account deletion reminder spam risk

- [x] Make reminder scheduling idempotent near due-date windows (prevent immediate re-send loops).
- [x] Add explicit guard condition + tests for repeated request calls close to scheduled deletion date.

Done when:

- [x] Repeated calls do not enqueue duplicate immediate reminders.

Validation run:

- `npm test -- libs/features/users/infra/jobs/user-account-deletion-email.jobs.spec.ts libs/features/users/app/users.service.spec.ts` ✅
- `npm run verify` ✅
- `npm run smells:arch` ✅ (`high=0, medium=0, low=11`)
- `DATABASE_URL=postgresql://postgres@127.0.0.1:54321/backend_core_kit?schema=public REDIS_URL=redis://127.0.0.1:63790/0 npm run verify:e2e` ✅

## Phase 5: Low-Risk Consistency Cleanup (Low)

- [ ] Centralize `asNonEmptyString` helper in one shared utility and migrate usages incrementally.
- [ ] Move password policy env read (`password-policy.ts`) behind validated config flow.
- [ ] Re-run architecture smell scan and update baseline only after review.

Done when:

- [ ] Low-level duplication is reduced without behavior changes.

## Validation Checklist (every phase)

- [ ] `npm run format:check`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run deps:check`
- [ ] `npm test`
- [ ] `npm run openapi:check`
- [ ] `npm run openapi:lint`
- [ ] `npm run smells:arch`
- [ ] `npm run audit:prod` (for phases touching dependencies/security)
- [ ] `npm run verify:e2e` (for phases touching persistence/queue/request flows)

## Suggested Execution Order

1. Phase 0 security + scaffold fixes.
2. Phase 1 timeout/retry hardening.
3. Phase 4 account deletion reminder idempotency.
4. Phase 2 hotspot decomposition + duplication removal.
5. Phase 3 auth/error typing hardening.
6. Phase 5 consistency cleanup.
