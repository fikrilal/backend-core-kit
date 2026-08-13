# Users Me and Account Deletion Capability Split

Date: 2026-08-09  
Owner: Codex  
Status: completed  
Risk class: high  
Related issue/PR: N/A

## Objective

Split `UsersService` into capability-owned services and create the `me/` and
`account-deletion/` capability folders, matching the auth pattern. Update the
auth feature's `UsersService` importers. Behavior-preserving.

## Constraints

- Architecture constraints:
  - capability folders with controller/DTO/service/jobs;
  - services stay plain framework-free classes with ports;
  - feature-internal `shared/` holds the filter, model, errors, persistence.
- Product/runtime constraints:
  - `GET/PATCH /v1/me`, `POST /v1/me/account-deletion/request|cancel` keep
    paths, operation IDs, tags, schemas, error codes;
  - auth login/register/OIDC `getMe` calls keep working;
  - queue job names/payloads unchanged.
- Out of scope:
  - profile-image moves (phase 3);
  - deleting `app/`/`infra/` trees (phase 4);
  - commits or pushes.

## Impact Areas

- API/OpenAPI: yes (controller/DTO ownership moves, contract preserved)
- DB/Prisma/migrations: no
- Auth/session/RBAC: yes (auth imports `UsersService.getMe`)
- Queue/jobs: yes (deletion jobs move)
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: no
- CI/release/harness: yes

## Acceptance Criteria

1. `me/` holds `MeController`, `me.dto.ts`, `me.service.ts` (getMe/updateMeProfile).
2. `account-deletion/` holds the controller, service (request/cancel), and
   deletion/email jobs + `users.queue.ts`.
3. Auth controllers import `getMe` from the new me service.
4. Endpoint paths, operation IDs, tags, schemas, error codes unchanged.
5. typecheck, lint, format, deps:check, users specs, and auth e2e pass.

## Implementation Checklist

- [ ] Create `me/me.service.ts` from `UsersService` (getMe, updateMeProfile).
- [ ] Create `account-deletion/account-deletion.service.ts` (request/cancel).
- [ ] Move `MeController` + `me.dto.ts` into `me/`.
- [ ] Move `UserAccountDeletionController` + deletion jobs + `users.queue.ts`
      into `account-deletion/`.
- [ ] Update auth imports (`oidc.controller.ts`, `password-auth.controller.ts`).
- [ ] Update `users.module.ts` providers/controllers.
- [ ] Run targeted verification + auth e2e.

## Decision Log

- 2026-08-09: Split `UsersService` (no facade, matching auth) -> each capability
  owns its service; `me.service.ts` re-exports `getMe` for auth callers.
- 2026-08-09: Keep `UserNotFoundError -> 401` mapping in the shared filter.

## Verification

```bash
npm run typecheck
npm run deps:check
npm run format:check
npm run lint
npm test -- --runTestsByPath libs/features/users/app/users.service.spec.ts libs/features/users/app/user-profile-image.service.spec.ts
NODE_ENV=development npm run openapi:generate
NODE_ENV=development npm run openapi:check
npm run openapi:lint
# auth e2e (login/register/OIDC depend on getMe)
env -u FCM_USE_APPLICATION_DEFAULT -u FCM_SERVICE_ACCOUNT_JSON_PATH -u FCM_SERVICE_ACCOUNT_JSON -u FCM_PROJECT_ID -u PUSH_PROVIDER \
  NODE_ENV=test npx jest --config test/jest-e2e.json --runInBand --runTestsByPath test/auth
```

## Runtime Evidence

Required: auth e2e proves login/register/OIDC still return the `me` view after
the `getMe` import move.

- Environment: local docker Postgres/Redis/MinIO.
- Executed flow: register -> login -> OIDC exchange -> `GET /v1/me`.
- Artifact path(s): test/auth e2e suite output.

## Risks And Mitigations

- Risk: splitting `UsersService` breaks auth `getMe` call sites.
  - Mitigation: keep `me.service.ts` exporting `getMe`; run auth e2e.
- Risk: account-deletion job moves break the worker.
  - Mitigation: update worker imports; run queue-smoke + users e2e.

## Completion Notes

Phase 2 implemented and verified:

- Split `UsersService` into `me/me.service.ts` (`MeService`: getMe, updateMeProfile)
  and `account-deletion/account-deletion.service.ts` (`AccountDeletionService`:
  request/cancel). Deleted the orphaned `app/users.service.ts` + its old spec.
- `me/` holds `MeController`, `me.dto.ts`, `me.service.ts` + `me.service.spec.ts`
  (4 tests, migrated from the old spec).
- `account-deletion/` holds the controller, service, deletion + email jobs,
  `users.queue.ts`, and the email-jobs spec; `account-deletion.service.spec.ts`
  (7 tests, migrated from the old spec).
- `users.module.ts` rewired: `MeService` + `AccountDeletionService` providers,
  exports `MeService`.
- Auth controllers (`oidc.controller.ts`, `password-auth.controller.ts`) now
  import `MeService` for `getMe`.
- Worker + test importers updated for the moved job contract files.

Verification outcomes:

- `npm run typecheck`: passed (0 errors).
- `npm run deps:check`: passed (285 modules, 743 deps, no violations).
- `npm run format:check`: passed.
- `npm run lint`: passed.
- Users specs (5 suites, 26 tests): passed.
- Auth e2e (4 suites, 53 tests): passed, incl. register/login/OIDC (getMe),
  `GET /v1/me`, and account-deletion request/cancel.
- Queue-smoke int (6 tests): passed (moved deletion jobs).
- `npm test`: 263 passed, 5 pre-existing platform env failures (unchanged).
- OpenAPI check + lint: passed (snapshot unchanged).

## Follow-Ups

- [ ] Phase 3: profile-image capability.
- [ ] Phase 4: cleanup + docs.
