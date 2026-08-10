# Admin Docs and Verification

Date: 2026-08-09  
Owner: Codex  
Status: completed  
Risk class: medium  
Related issue/PR: N/A

## Objective

Finish the admin reorganization: update any docs referencing the old admin
structure, run the full verification gate (including auth-admin e2e for RBAC
evidence), and mark the plans complete.

## Constraints

- Architecture constraints:
  - no `app/`/`infra/` trees remain under `libs/features/admin`;
  - capability folders + `shared/` only;
  - `admin.module.ts` at the feature root.
- Product/runtime constraints:
  - no endpoint, OpenAPI, RBAC, or persistence behavior change.
- Out of scope:
  - commits or pushes.

## Impact Areas

- API/OpenAPI: no
- DB/Prisma/migrations: no
- Auth/session/RBAC: yes (auth-admin e2e evidence)
- Queue/jobs: no
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: no
- CI/release/harness: yes

## Acceptance Criteria

1. Docs referencing the old admin structure are updated.
2. OpenAPI snapshot unchanged.
3. typecheck, lint, format, deps:check, admin specs, and auth e2e (incl.
   auth-admin) pass.
4. Exec plans moved to `completed/` with completion notes.

## Implementation Checklist

- [ ] Find and update stale admin path references in docs (e.g.
      duplication-harness example paths).
- [ ] Run full verification: typecheck, deps, lint, format, project-map,
      OpenAPI, unit, auth e2e (incl. auth-admin), int suites.
- [ ] Record runtime evidence (auth-admin e2e proves RBAC intact).
- [ ] Mark both admin exec plans complete and move to `completed/`.

## Decision Log

- 2026-08-09: Auth-admin e2e is the runtime evidence for RBAC preservation.

## Verification

```bash
npm run typecheck
npm run deps:check
npm run format:check
npm run lint
npm run verify:project-map
npm test
NODE_ENV=development npm run openapi:generate
NODE_ENV=development npm run openapi:check
npm run openapi:lint
# auth e2e (auth-admin proves RBAC)
env -u FCM_USE_APPLICATION_DEFAULT -u FCM_SERVICE_ACCOUNT_JSON_PATH -u FCM_SERVICE_ACCOUNT_JSON -u FCM_PROJECT_ID -u PUSH_PROVIDER \
  NODE_ENV=test npx jest --config test/jest-e2e.json --runInBand --runTestsByPath test/auth/auth-admin.e2e-spec.ts test/auth/auth-core.e2e-spec.ts
```

## Runtime Evidence

Required: auth-admin e2e proves role-change/status-change and RBAC hydration
work after the move.

- Environment: local docker Postgres/Redis/MinIO.
- Executed flow: admin list, role change, status change, whoami.
- Artifact path(s): test/auth/auth-admin.e2e-spec.ts output.

## Risks And Mitigations

- Risk: RBAC behavior drifts unnoticed.
  - Mitigation: auth-admin e2e + admin specs.
- Risk: docs still reference the old structure.
  - Mitigation: update docs in the same change.

## Completion Notes

Phase 2 implemented and verified:

- Updated `tools/duplication-allowlist.json` admin paths to the capability
  structure (`admin-audit/admin-audit.dto.ts`,
  `shared/persistence/prisma-admin-{audit,users}.query-builders.ts`).
- No stale `features/admin/app` or `features/admin/infra` references remain in
  docs or tooling.

Verification outcomes:

- `npm run typecheck`: passed (0 errors).
- `npm run deps:check`: passed (280 modules, 738 deps, no violations).
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run verify:project-map`: passed.
- `npm test`: 263 passed, 5 pre-existing platform env failures (unchanged).
- Auth e2e (4 suites, 53 tests): passed, incl. auth-admin (RBAC intact).
- Int suites (admin-last-admin, queue-smoke, rate-limiters; 11 tests): passed.
- OpenAPI check + lint: passed (snapshot unchanged).

The admin progressive feature refactor is complete (phases 1-2).

## Follow-Ups

- No outstanding admin refactor debt. The 5 pre-existing platform env failures
  remain tracked separately.
