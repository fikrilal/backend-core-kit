# Users Shared Foundation

Date: 2026-08-09  
Owner: Codex  
Status: completed  
Risk class: medium  
Related issue/PR: N/A

## Objective

Build the `libs/features/users/shared/` layer and move the module to the feature
root, mirroring the completed auth structure. Remove the re-export shims
(`app/time.ts`, `app/users.error-codes.ts`) and prepare the ground for the
capability moves. Behavior-preserving.

## Constraints

- Architecture constraints:
  - keep `libs/platform/*` independent from `libs/features/*`;
  - keep `libs/shared/*` framework-free;
  - feature-internal `shared/` may import platform adapters.
- Product/runtime constraints:
  - no endpoint, OpenAPI, persistence, or queue behavior change.
- Out of scope:
  - moving controllers/services into capability folders (phases 2-3);
  - deleting the `app/`/`infra/` trees (phase 4);
  - commits or pushes.

## Impact Areas

- API/OpenAPI: no
- DB/Prisma/migrations: no
- Auth/session/RBAC: no
- Queue/jobs: no
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: no
- CI/release/harness: yes

## Acceptance Criteria

1. `users.module.ts` lives at `libs/features/users/users.module.ts`.
2. `shared/` holds the model, errors, error filter, ports, and persistence.
3. `app/time.ts` and `app/users.error-codes.ts` shims are gone; importers use
   `libs/shared/time` and `users.errors.ts` directly.
4. `USERS_CLOCK` token is folded into a stable home (module or shared tokens).
5. typecheck, lint, format, deps:check, and the users specs pass.

## Implementation Checklist

- [ ] Move `users.module.ts` from `infra/` to the feature root.
- [ ] Create `shared/users.model.ts` (merge `users.types.ts` + `profile-image.policy.ts`).
- [ ] Move `users.errors.ts` to `shared/` and fold in the `UsersErrorCode` re-export.
- [ ] Move `users-error.filter.ts` to `shared/`.
- [ ] Move ports to `shared/ports/` (merge small ports into `users.ports.ts`).
- [ ] Move persistence files to `shared/persistence/`.
- [ ] Fold `USERS_CLOCK` into `shared/users.tokens.ts` (or the module).
- [ ] Remove `app/time.ts` shim; update importers to `libs/shared/time`.
- [ ] Update all importers of the moved files.
- [ ] Run targeted verification.

## Decision Log

- 2026-08-09: Mirror the auth `shared/` layout -> consistent navigation and
  proven pattern.
- 2026-08-09: Merge `users.types.ts` + `profile-image.policy.ts` into
  `users.model.ts` -> same tiny-file consolidation applied to auth.

## Verification

```bash
npm run typecheck
npm run deps:check
npm run format:check
npm run lint
npm test -- --runTestsByPath libs/features/users/app/users.service.spec.ts libs/features/users/app/user-profile-image.service.spec.ts libs/features/users/infra/persistence/prisma-users.repository.spec.ts
```

## Runtime Evidence

Not required; this phase changes import paths and file locations only.

## Risks And Mitigations

- Risk: import rewiring breaks the module or specs.
  - Mitigation: mechanical path updates; typecheck + targeted specs.
- Risk: `USERS_CLOCK` folding changes DI.
  - Mitigation: keep the `SystemClock` token provider; module wiring unchanged.

## Completion Notes

Phase 1 implemented and verified:

- `users.module.ts` moved from `infra/` to the feature root; `apps/api/src/app.module.ts`
  and `libs/features/auth/auth.module.ts` importers updated.
- `shared/` built: `users.model.ts` (merged `users.types.ts` + `profile-image.policy.ts`),
  `users.errors.ts` (now hosts the `UsersErrorCode` re-export), `users-error.filter.ts`,
  `users.tokens.ts` (USERS_CLOCK), `ports/` (4 ports), `persistence/` (2 repos + spec).
- Removed the `app/time.ts` and `app/users.error-codes.ts` re-export shims; all importers
  now use `libs/shared/time` and `shared/users.errors.ts` directly.
- Updated `.dependency-cruiser.cjs`: the `feature-app-must-not-import-infra-or-framework`
  rule now allows `app` -> `shared` (feature-internal shared folder), so interim `app/`
  services can import `shared/` until phases 2-3 move them out.
- The storage adapter stays in `infra/storage/` (moves with `profile-image/` in phase 3).

Verification outcomes:

- `npm run typecheck`: passed (0 errors).
- `npm run deps:check`: passed (283 modules, 739 deps, no violations).
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm test`: 263 passed, 5 pre-existing platform env failures (unchanged baseline).
- Users specs (5 suites, 28 tests): passed.
- OpenAPI check + lint: passed (snapshot unchanged).

## Follow-Ups

- [ ] Phase 2: me + account-deletion capabilities.
- [ ] Phase 3: profile-image capability.
- [ ] Phase 4: cleanup + docs.
