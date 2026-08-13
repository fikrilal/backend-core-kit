# Backend Users Progressive Feature Architecture Proposal

- Status: Proposed for planning
- Date: 2026-08-09
- Scope: reorganizing `libs/features/users` from the clean-architecture shape (`app/` + `infra/`) into capability folders + a shared layer, matching the auth feature's completed structure
- Non-scope: changing runtime behavior, public API contracts, Prisma schema, or queue semantics

## Summary

The auth feature was reorganized (Phases 1-7 of `docs/engineering/auth/capability-split-roadmap.md`) into capability folders with a `shared/` layer, and that structure is now the proven default. The users feature still uses the pre-refactor clean-architecture shape: `app/` (services, ports, types, errors) + `infra/` (http, persistence, jobs, rate-limit, storage) + `infra/users.module.ts`.

This proposal reorganizes `libs/features/users` to match the auth pattern: capability folders (`me/`, `profile-image/`, `account-deletion/`) plus a `shared/` layer, with the module at the feature root. It is a behavior-preserving file reorganization.

## Current Context

Current structure (35 files, ~3,449 lines):

```text
libs/features/users/
  app/
    users.service.ts          # getMe, updateMeProfile, request/cancel account deletion
    user-profile-image.service.ts
    profile-image.policy.ts
    users.types.ts
    users.errors.ts
    users.error-codes.ts      # re-export shim
    time.ts                   # re-export shim
    ports/
      users.repository.ts
      profile-image.repository.ts
      profile-image.storage.ts
      account-deletion.scheduler.ts
  infra/
    users.module.ts
    users.tokens.ts           # USERS_CLOCK
    http/
      me.controller.ts
      profile-image.controller.ts
      user-account-deletion.controller.ts
      users-error.filter.ts
      dtos/me.dto.ts
      dtos/profile-image.dto.ts
    persistence/
      prisma-users.repository.ts
      prisma-profile-image.repository.ts
    jobs/
      user-account-deletion.job.ts / .jobs.ts
      user-account-deletion-email.job.ts / .jobs.ts
      profile-image-cleanup.job.ts / .jobs.ts
      users.queue.ts
    rate-limit/
      redis-profile-image-upload-rate-limiter.ts
    storage/
      users-profile-image-storage.adapter.ts
```

Three endpoint groups:

- `me/` — `GET/PATCH /v1/me` (via `UsersService`)
- `profile-image/` — upload/complete/clear/url (via `UserProfileImageService`)
- `account-deletion/` — request/cancel (via `UsersService`)

## Goals

- Match the auth feature's proven capability-oriented structure.
- Remove the re-export shims and the `app/`/`infra/` trees.
- Keep behavior, endpoints, OpenAPI contracts, queue semantics, and persistence identical.
- Keep the framework-free services testable via their ports.
- Update the docs that describe the users feature.

## Non-goals

- No runtime behavior changes.
- No public API contract changes.
- No Prisma schema or migration changes.
- No queue/job name, payload, or semantics changes.
- No change to the auth feature's `UsersService` dependency (login/register/OIDC call `getMe`).

## Proposed Architecture

```text
libs/features/users/
  users.module.ts              # moved from infra/, module wiring unchanged

  shared/
    users.model.ts             # merged users.types.ts + profile-image.policy.ts
    users.errors.ts            # UsersError + UserNotFoundError + UsersErrorCode re-export
    users-error.filter.ts      # moved from infra/http/
    ports/
      users.ports.ts           # merged small ports (storage, scheduler)
      users.repository.ts
      profile-image.repository.ts
    persistence/               # moved from infra/persistence/
      prisma-users.repository.ts
      prisma-profile-image.repository.ts

  me/
    me.controller.ts
    me.dto.ts
    me.service.ts              # UsersService (getMe, updateMeProfile)

  profile-image/
    profile-image.controller.ts
    profile-image.dto.ts
    profile-image.service.ts   # UserProfileImageService
    profile-image.policy.ts
    profile-image.storage.ts   # moved storage adapter
    redis-profile-image-upload-rate-limiter.ts
    profile-image-cleanup.job.ts / .jobs.ts

  account-deletion/
    account-deletion.controller.ts
    account-deletion.service.ts  # request/cancel (split out of UsersService)
    user-account-deletion.job.ts / .jobs.ts
    user-account-deletion-email.job.ts / .jobs.ts
    users.queue.ts
```

## Decisions To Confirm

1. **Split `UsersService`**: `me.service.ts` (getMe, updateMeProfile) + `account-deletion.service.ts` (request/cancel). Auth deleted its `AuthService` facade; splitting keeps each capability self-contained. The auth controllers keep importing `UsersService` (now `me.service.ts`'s export) for `getMe`.

2. **`UsersErrorFilter`**: keep one shared filter for the feature (like auth's shared `AuthErrorFilter`), with the `UserNotFoundError -> 401` special-case preserved.

3. **Where `USERS_CLOCK` token lives**: fold into `users.module.ts` or a shared `users.tokens.ts`; keep the `Clock` injection pattern.

4. **Job contract files**: the worker imports them by path; keep file names stable or update worker imports mechanically.

## Invariants

- `libs/platform/*` must not import `libs/features/*`.
- `libs/shared/*` stays framework-free.
- `shared/` (feature-internal) may import platform adapters; it is not `libs/shared`.
- Capability services stay plain framework-free classes; controllers/DTOs stay thin.
- Endpoint paths, operation IDs, tags, schemas, error codes, and queue contracts are unchanged.
- OpenAPI snapshot must be regenerated/checked/linted after controller/DTO moves.

## Rollout

1. Move `users.module.ts` to the feature root; rewire imports.
2. Create `shared/` (model, errors, filter, ports, persistence).
3. Create `me/`, `profile-image/`, `account-deletion/` capability folders.
4. Split `UsersService` into `me.service.ts` + `account-deletion.service.ts`.
5. Update worker + auth imports.
6. Delete `app/` and `infra/` trees.
7. Regenerate OpenAPI, run targeted tests (users specs + auth e2e + users e2e), update docs.

## Risks And Tradeoffs

| Risk                                                       | Impact                         | Mitigation                                                                      |
| ---------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| Splitting `UsersService` changes auth's `getMe` call sites | Auth login/register/OIDC break | Keep `me.service.ts` exporting `getMe`; update the 2 auth imports; run auth e2e |
| Worker job imports break                                   | Queue consumers fail           | Update worker imports mechanically; run queue-smoke + users e2e                 |
| OpenAPI contract changes                                   | Client breakage                | Preserve decorators; OpenAPI generate/check/lint                                |
| Docs describe the old structure                            | Stale guidance                 | Update roadmap/guide docs in the same change                                    |

## Acceptance Criteria

- `app/` and `infra/` trees are gone; capability folders + `shared/` exist.
- No re-export shims remain (`time.ts`, `users.error-codes.ts`).
- Endpoint paths, operation IDs, tags, schemas, error codes unchanged.
- OpenAPI snapshot unchanged (or ordering-only).
- typecheck, lint, format, deps:check, users specs, users e2e, and auth e2e pass.
