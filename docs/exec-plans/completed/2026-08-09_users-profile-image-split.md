# Users Profile Image Capability Split

Date: 2026-08-09  
Owner: Codex  
Status: completed  
Risk class: high  
Related issue/PR: N/A

## Objective

Move the profile-image endpoint group into a `profile-image/` capability
folder, matching the auth pattern: controller, DTOs, service, policy, storage
adapter, rate-limiter, and cleanup jobs. Behavior-preserving.

## Constraints

- Architecture constraints:
  - `profile-image/` owns its controller/DTOs/service/policy/storage/rate-limit/jobs;
  - services stay plain framework-free classes with ports;
  - storage adapter stays in the capability (it adapts platform storage).
- Product/runtime constraints:
  - `POST /v1/me/profile-image/upload|complete`, `DELETE /v1/me/profile-image`,
    `GET /v1/me/profile-image/url` keep paths, operation IDs, tags, schemas,
    error codes;
  - presigned URL semantics, size/content-type verification, and rate limits
    unchanged;
  - queue job names/payloads unchanged.
- Out of scope:
  - deleting `app/`/`infra/` trees (phase 4);
  - commits or pushes.

## Impact Areas

- API/OpenAPI: yes (controller/DTO ownership moves, contract preserved)
- DB/Prisma/migrations: no
- Auth/session/RBAC: no
- Queue/jobs: yes (cleanup jobs move)
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: yes (object storage adapter path moves)
- CI/release/harness: yes

## Acceptance Criteria

1. `profile-image/` holds controller, DTOs, service, policy, storage adapter,
   rate-limiter, and cleanup job files.
2. Endpoint paths, operation IDs, tags, schemas, error codes unchanged.
3. Storage verification behavior (size/content-type mismatch, reject-upload)
   unchanged.
4. typecheck, lint, format, deps:check, profile-image specs, and users e2e pass.

## Implementation Checklist

- [ ] Move `UserProfileImageService` + `profile-image.policy.ts` into
      `profile-image/`.
- [ ] Move `ProfileImageController` + `profile-image.dto.ts` into `profile-image/`.
- [ ] Move `users-profile-image-storage.adapter.ts` into `profile-image/`.
- [ ] Move `redis-profile-image-upload-rate-limiter.ts` into `profile-image/`.
- [ ] Move `profile-image-cleanup.job.ts` / `.jobs.ts` into `profile-image/`.
- [ ] Update worker imports for the cleanup job contracts.
- [ ] Update `users.module.ts` providers/controllers.
- [ ] Run targeted verification + users e2e.

## Decision Log

- 2026-08-09: Keep `profile-image.policy.ts` inside the capability (not merged
  into `users.model.ts`) -> the constants are capability-specific.
- 2026-08-09: Move the storage adapter with the capability -> it is only used
  by profile-image.

## Verification

```bash
npm run typecheck
npm run deps:check
npm run format:check
npm run lint
npm test -- --runTestsByPath libs/features/users/app/user-profile-image.service.spec.ts libs/features/users/infra/storage/users-profile-image-storage.adapter.spec.ts
NODE_ENV=development npm run openapi:generate
NODE_ENV=development npm run openapi:check
npm run openapi:lint
# users e2e (profile image flows)
env -u FCM_USE_APPLICATION_DEFAULT -u FCM_SERVICE_ACCOUNT_JSON_PATH -u FCM_SERVICE_ACCOUNT_JSON -u FCM_PROJECT_ID -u PUSH_PROVIDER \
  NODE_ENV=test npx jest --config test/jest-e2e.json --runInBand --runTestsByPath test/auth/auth-me.e2e-spec.ts
```

## Runtime Evidence

Required: users e2e proves upload-plan -> complete (size/content-type checks) ->
clear -> url flows still work against real MinIO.

- Environment: local docker Postgres/Redis/MinIO.
- Executed flow: upload plan -> complete -> get url -> clear.
- Artifact path(s): test/auth/auth-me.e2e-spec.ts output.

## Risks And Mitigations

- Risk: worker cleanup-job imports break.
  - Mitigation: update worker imports; run queue-smoke.
- Risk: storage verification behavior drifts.
  - Mitigation: no semantic edits; service spec covers mismatch paths.

## Completion Notes

Phase 3 implemented and verified:

- `profile-image/` now holds the whole capability:
  - `profile-image.service.ts` (was `app/user-profile-image.service.ts`, class
    `UserProfileImageService` kept) + `profile-image.service.spec.ts`;
  - `profile-image.policy.ts`, `profile-image.controller.ts`, `profile-image.dto.ts`;
  - `profile-image.storage.ts` (was `infra/storage/users-profile-image-storage.adapter.ts`)
    + spec;
  - `redis-profile-image-upload-rate-limiter.ts`;
  - `profile-image-cleanup.job.ts` / `.jobs.ts`.
- `users.module.ts` rewired to the new paths.
- Worker + test importers updated for the moved cleanup job contracts and
  rate-limiter.
- No semantic edits; storage verification behavior unchanged.

Verification outcomes:

- `npm run typecheck`: passed (0 errors).
- `npm run deps:check`: passed (285 modules, 743 deps, no violations).
- `npm run format:check`: passed.
- `npm run lint`: passed.
- Profile-image specs (2 suites, 12 tests): passed.
- Users e2e (`auth-me`, 23 tests): passed — upload-plan -> complete -> url ->
  clear flows against real MinIO/Redis/DB.
- Queue-smoke int (6 tests): passed (cleanup jobs).
- `npm test`: 263 passed, 5 pre-existing platform env failures (unchanged).
- OpenAPI check + lint: passed (snapshot unchanged).

## Follow-Ups

- [ ] Phase 4: cleanup + docs.
