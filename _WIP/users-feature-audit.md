# Users feature audit (app only, infra excluded)

Date: 2026-01-18

## Scope

Included:

- `libs/features/users/app/**`

Excluded (next sprint):

- `libs/features/users/infra/**`

This is a static code quality audit (readability, maintainability, complexity, security mindset) and an alignment check against:

- `docs/core/project-architecture.md`
- `docs/standards/api-response-standard.md`
- `docs/standards/error-codes.md`
- `docs/engineering/users/account-deletion.md`
- `docs/engineering/users/profile-images.md`

## Snapshot

The Users app layer is **small** and generally **easy to read**. The two core services (`UsersService`, `UserProfileImageService`) are cohesive, ports are explicit, and the code largely matches the feature docs.

Main improvement opportunities are around **testability**, **time handling consistency**, and **contract/typing consistency for errors** (to reduce drift and future infra boilerplate).

## What’s working well

- **Clear boundaries**: app code avoids NestJS/Prisma and depends only on ports + platform abstractions (`ObjectStorageService`), consistent with `infra -> app -> domain` direction.
- **Doc alignment**:
  - Account deletion uses a 30-day grace period (`docs/engineering/users/account-deletion.md`).
  - Profile image policy (content types, max size) matches the docs (`docs/engineering/users/profile-images.md`).
- **Ports are explicit and “policy-friendly”**:
  - `UsersRepository.requestAccountDeletion(...)` takes `now` and `scheduledFor`, which is good for determinism and makes it harder for persistence to invent time.
  - `AccountDeletionScheduler` is a clean port that keeps scheduling details out of app logic.
- **Profile image flow is defensive**: verifies `HEAD` object metadata before attach (existence, content type, size) before linking to profile.

## Findings (prioritized)

### P1 — Testability: no unit tests for Users app services

Evidence:

- No `*.spec.ts` under `libs/features/users/app/**`.
- Critical logic lives in app services (account deletion scheduling, profile-image verification behavior, error shapes/codes).

Why this matters:

- Users flows include lifecycle/security-adjacent behavior (account deletion, file upload finalize). Lack of app-level unit tests makes regressions easy when infra changes (controllers/Prisma/jobs) even if overall e2e still passes in happy paths.

Recommendation:

- Add focused unit tests with in-memory fakes for:
  - `UsersService.requestAccountDeletion` (new request vs already requested vs last admin vs not found).
  - `UsersService.cancelAccountDeletion` (not found vs idempotent cancel).
  - `UserProfileImageService.createUploadPlan` (validation failures, storage disabled, user not found).
  - `UserProfileImageService.completeUpload` (missing file, already active, size/type mismatch triggers reject, previous file id returned).

Implemented (2026-01-18):

- Added unit tests:
  - `libs/features/users/app/users.service.spec.ts`
  - `libs/features/users/app/user-profile-image.service.spec.ts`

### P1 — Consistency: time handling is ad-hoc (no shared clock / helper)

Evidence:

- `new Date()` is used directly in `UsersService` (`libs/features/users/app/users.service.ts:39`, `libs/features/users/app/users.service.ts:75`).
- `new Date()` / `Date.now()` are used directly in profile image flows (`libs/features/users/app/user-profile-image.service.ts:90`, `libs/features/users/app/user-profile-image.service.ts:175`, `libs/features/users/app/user-profile-image.service.ts:225`, `libs/features/users/app/user-profile-image.service.ts:231`).

Why this matters:

- Makes deterministic unit tests harder (you end up asserting “approximately now” or stubbing globals).
- Auth recently standardized time handling; Users should converge on the same approach to reduce cognitive overhead across features.

Recommendation (pick one and standardize within Users):

- **Option A (preferred, consistent with Auth):** inject a platform `Clock` into Users app services and derive `now` from it.
- **Option B:** push `now`/`expiresAt` calculation to the edge (infra) and make app methods accept `now` explicitly (similar to how `UsersRepository` is shaped today).

### P2 — Contract/typing: error codes are partially untyped + raw strings still exist

Evidence:

- `UsersError.code` is `string` (`libs/features/users/app/users.errors.ts:9`).
- `UserProfileImageService` uses raw global codes as string literals:
  - `code: 'VALIDATION_FAILED'`
  - `code: 'NOT_FOUND'`
  - (`libs/features/users/app/user-profile-image.service.ts:52`, `libs/features/users/app/user-profile-image.service.ts:126`)

Why this matters:

- `docs/standards/error-codes.md` treats codes as part of the API contract. Leaving them as raw strings increases drift risk (typos, inconsistent reuse).
- Users already has `UsersErrorCode` enum; the untyped `string` loses most of the benefit.

Recommendation:

- Tighten `UsersError.code` to `UsersErrorCode | ErrorCode` (global codes) and replace string literals with the enum values:
  - `ErrorCode.VALIDATION_FAILED`, `ErrorCode.NOT_FOUND`, etc.
- Keep feature-specific codes in `UsersErrorCode` as-is.

### P2 — Boundary purity: app layer returns JSON-ready “view models” (Date → string)

Evidence:

- `UsersService.toMeView()` serializes dates as ISO strings (`libs/features/users/app/users.service.ts:98`).
- `UserProfileImageService` returns `expiresAt: string` and `ProfileImageUrlView` with strings.
  - (`libs/features/users/app/user-profile-image.service.ts:15`, `libs/features/users/app/user-profile-image.service.ts:90`, `libs/features/users/app/user-profile-image.service.ts:225`)

Why this matters:

- It couples app logic to HTTP/JSON transport concerns, making reuse in non-HTTP contexts (jobs/CLI) less clean.
- It’s a frequent source of subtle drift: app starts doing “DTO work”, then infra also does it.

Recommendation:

- Consider returning `Date` values from app services and perform serialization in infra DTO mapping (when `users/infra` is in-scope).
- If you prefer “app owns view models”, document it as a deliberate pattern and apply it consistently across features.

### P2 — Maintainability: make invariants explicit in port contracts

Evidence:

- `UserRecord` includes `status: 'ACTIVE' | 'SUSPENDED' | 'DELETED'` (`libs/features/users/app/users.types.ts:5`, `libs/features/users/app/users.types.ts:25`), but app services do not branch on `status`.

Why this matters:

- This relies on an implicit repository invariant (“deleted users are filtered out”), which is easy to forget when implementing new repositories/adapters.

Recommendation:

- Document this in `UsersRepository` (e.g., “methods return `null` for deleted users”), or rename methods to make it explicit (`findActiveById`, `updateActiveProfile`, etc.).
- Alternatively, add an app-level guard (`assertUserNotDeleted`) as defense-in-depth (even if the current repo already filters).

## Suggested next steps (smallest-first)

1. Add unit tests for `UsersService` + `UserProfileImageService` using fakes.
2. Standardize time source within users app services (Clock injection or explicit `now` params).
3. Type error codes (`UsersErrorCode | ErrorCode`) and remove remaining raw string codes.
4. (Later, when infra is in-scope) decide whether Date serialization belongs in app vs infra, then refactor accordingly.

## Notes on checks

This is a manual audit + targeted searches; no new tests were added or executed as part of this report.
