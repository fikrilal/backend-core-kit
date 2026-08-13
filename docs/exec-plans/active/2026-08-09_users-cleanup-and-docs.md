# Users Cleanup and Docs

Date: 2026-08-09  
Owner: Codex  
Status: active  
Risk class: medium  
Related issue/PR: N/A

## Objective

Finish the users reorganization: delete the `app/` and `infra/` trees, update
the worker job-contract imports, update the docs that describe the users
feature, and run the full verification (including OpenAPI gates).

## Constraints

- Architecture constraints:
  - no `app/`/`infra/`/`domain/` trees remain under `libs/features/users`;
  - capability folders + `shared/` only;
  - `users.module.ts` at the feature root.
- Product/runtime constraints:
  - no endpoint, OpenAPI, persistence, or queue behavior change;
  - worker imports compile against the moved job contract files.
- Out of scope:
  - auth feature changes;
  - commits or pushes.

## Impact Areas

- API/OpenAPI: no
- DB/Prisma/migrations: no
- Auth/session/RBAC: no
- Queue/jobs: yes (worker import paths)
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: no
- CI/release/harness: yes

## Acceptance Criteria

1. `app/` and `infra/` trees are deleted from `libs/features/users`.
2. Worker job-contract imports point at the new capability paths.
3. Docs (`docs/engineering/...`, guide docs, project architecture if it lists
   the users shape) describe the capability structure.
4. OpenAPI snapshot unchanged.
5. typecheck, lint, format, deps:check, users specs, users e2e, and auth e2e
   pass.

## Implementation Checklist

- [ ] Delete `app/` and `infra/` trees.
- [ ] Update worker imports (`apps/worker/src/jobs/*`) for moved job contracts.
- [ ] Update `test/` imports (queue-smoke, users specs) if needed.
- [ ] Update docs referencing the old users structure.
- [ ] Run full verification (unit + e2e + int + OpenAPI).

## Decision Log

- 2026-08-09: Delete rather than keep compatibility re-exports -> no stale
  paths, matching the auth cleanup.

## Verification

```bash
npm run typecheck
npm run deps:check
npm run format:check
npm run lint
npm test
npm run verify:project-map
NODE_ENV=development npm run openapi:generate
NODE_ENV=development npm run openapi:check
npm run openapi:lint
# users + auth e2e
env -u FCM_USE_APPLICATION_DEFAULT -u FCM_SERVICE_ACCOUNT_JSON_PATH -u FCM_SERVICE_ACCOUNT_JSON -u FCM_PROJECT_ID -u PUSH_PROVIDER \
  NODE_ENV=test npx jest --config test/jest-e2e.json --runInBand --runTestsByPath test/auth
# queue-smoke int (worker job contracts)
env -u FCM_USE_APPLICATION_DEFAULT -u FCM_SERVICE_ACCOUNT_JSON_PATH -u FCM_SERVICE_ACCOUNT_JSON -u FCM_PROJECT_ID -u PUSH_PROVIDER \
  NODE_ENV=development npx jest --config test/jest-int.json --runInBand --runTestsByPath test/queue-smoke.int-spec.ts
```

## Runtime Evidence

Required: users + auth e2e and queue-smoke prove no behavior drift after the
tree deletion.

- Environment: local docker Postgres/Redis/MinIO.
- Executed flow: auth e2e (me, profile image, account deletion) + queue-smoke.
- Artifact path(s): test/auth + test/queue-smoke output.

## Risks And Mitigations

- Risk: deleting `infra/` breaks worker or test imports.
  - Mitigation: mechanical import updates; full e2e + int run.
- Risk: docs still reference the old structure.
  - Mitigation: update roadmap/guide docs in the same change.

## Completion Notes

To be filled after execution.

## Follow-Ups

- [ ] Add any unresolved debt to `docs/exec-plans/tech-debt-tracker.md`.
