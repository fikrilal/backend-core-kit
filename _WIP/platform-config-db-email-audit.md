# Platform audit: config + db + email

Date: 2026-01-19

## Scope

Included:

- `libs/platform/config/**`
  - `dotenv.ts`
  - `env.validation.ts`
  - `env-parsing.ts`
  - `log-level.ts`
- `libs/platform/db/**`
  - `prisma.service.ts`
  - `prisma.module.ts`
  - `advisory-locks.ts`
- `libs/platform/email/**`
  - `email.service.ts`
  - `email.types.ts`
  - `email.queue.ts`
  - `email.module.ts`

Reviewed for context:

- `docs/standards/configuration.md`
- `docs/standards/database.md`
- `docs/standards/security.md`
- `docs/standards/code-quality.md`
- `docs/standards/queues-jobs.md`

Excluded:

- feature-layer usage of these modules (`libs/features/**`)
- worker/job orchestration outside these platform modules (`apps/**`)

Method:

- Static code review + reading unit tests in scope.
- No code changes were made as part of this audit.

## Snapshot

Overall, these modules are compact and largely align with the kit’s standards:

- Config validation is present and tested, and includes cross-field consistency checks.
- Prisma wiring matches the documented baseline (`@prisma/adapter-pg` + `DATABASE_URL`).
- Email adapter isolates provider-specific behavior behind a small surface.

Main opportunities are:

1. Make config parsing **more fail-fast** for invalid optional booleans (currently can be silently ignored).
2. Reduce “surprise factor” around `.env` loading semantics in non-dev environments.
3. Improve maintainability naming/documentation for DB “locks” utilities, and clarify intended usage.

## What’s working well

### Config (`libs/platform/config`)

- **Fail-fast validation exists** (`validateEnv`) and is wired into Nest `ConfigModule` in `apps/api/src/app.module.ts`.
- **Consistency checks** are present for:
  - Email config (`RESEND_API_KEY` ↔ `EMAIL_FROM`)
  - Push config (`PUSH_PROVIDER=FCM` requirements)
  - Storage config (`STORAGE_S3_*` all-or-nothing)
- **Prod/staging required surface is enforced** (`requireInProductionLike`), aligning with `docs/standards/configuration.md`.
- `loadDotEnvOnce()` is **concurrency-safe** and idempotent, and is called before importing modules in bootstraps (prevents the “DTO/env divergence” class of issues).

### DB (`libs/platform/db`)

- `PrismaService` uses Prisma’s Postgres adapter (`@prisma/adapter-pg`) as documented in `docs/standards/database.md`.
- Startup behavior is reasonable:
  - production-like env connects and pings on init
  - non-prod can run without a DB when it’s not configured (useful for some dev/test flows)
- Transaction wrapper exists (`transaction(fn)`), enabling use-cases to enforce atomic invariants.

### Email (`libs/platform/email`)

- Clear enable/disable semantics (`isEnabled()`).
- Provider-specific code is isolated; callers don’t need to know Resend API details.
- Basic unit test coverage exists for “configured vs not configured” behavior.
- Queue naming is aligned with `docs/standards/queues-jobs.md` (`emails`).

## Findings (prioritized)

### P1 — Correctness/operability: invalid optional booleans can be silently ignored in config parsing

Evidence:

- `parseEnvBoolean()` returns `undefined` for invalid values (e.g., `maybe`).
- Many booleans are `@IsOptional()` + `@IsBoolean()` and use `@Transform(parseEnvBoolean)`.

Why this matters:

- This weakens the “fail fast validation” guarantee from `docs/standards/configuration.md`.
- It can produce confusing behavior:
  - e.g., `LOG_PRETTY=maybe` is silently treated as “unset”.
  - e.g., `FCM_USE_APPLICATION_DEFAULT=yes` (invalid per parser) is ignored, potentially causing confusing downstream “missing service account” errors.

Recommendation:

- Treat “provided but invalid” booleans as validation errors (fail startup).
  - Example approach: when a value is provided and cannot be parsed, return the original value so `IsBoolean` fails, while still allowing `undefined`/empty to behave as “unset”.

Status:

- Implemented (2026-01-19): invalid boolean values now fail validation instead of being treated as “unset”.

### P1 — Maintainability: `env.validation.ts` is a growing “mega schema” with mixed concerns

Evidence:

- `libs/platform/config/env.validation.ts` includes runtime, DB, Redis, auth, users, email, push, and storage config in one file.

Why this matters:

- Review/edit overhead grows non-linearly as more platform/features add config.
- It increases risk of accidental drift between docs and actual required surface.

Recommendation:

- Keep a single exported `validateEnv`, but split the schema into small, cohesive parts (e.g., `env.auth.ts`, `env.email.ts`, `env.storage.ts`) and compose them.
- Alternatively, keep one file but enforce stronger internal grouping + comment “table of contents” conventions.

### P2 — Security/operability: `.env` loading semantics are implicit and not environment-scoped

Evidence:

- `loadDotEnvOnce()` loads `.env` if present, regardless of `NODE_ENV`.

Why this matters:

- While `dotenv` does not override existing env vars by default, it can still fill in missing optional variables in production-like environments, which can be surprising and complicate incident response (“why did this value exist?”).

Recommendation:

- Document this explicitly in `docs/standards/configuration.md`, or
- Make `.env` loading conditional (e.g., only in `development`/`test`) or emit a warning when `.env` exists in production-like env.

Status:

- Implemented (2026-01-19): `.env` is only loaded automatically in `development`/`test`, and this is documented in `docs/standards/configuration.md`.

### P2 — Maintainability: `advisory-locks.ts` is misnamed (it uses row locks, not advisory locks)

Evidence:

- `lockActiveAdminInvariant()` uses `SELECT ... FOR UPDATE` on `"User"` rows.

Why this matters:

- Naming mismatch increases cognitive load and can mislead future contributors about the concurrency mechanism.

Recommendation:

- Rename to reflect behavior (`row-locks.ts` / `invariant-locks.ts`) or add a short header comment explaining the locking strategy and why row locks are used.

### P2 — Email robustness: `EmailService` doesn’t validate subject or enforce a minimal contract consistently

Evidence:

- `send()` validates recipients and content, but does not enforce non-empty `subject` (passes through as-is).

Why this matters:

- Subject emptiness is usually a caller bug; catching early improves correctness and debuggability.

Recommendation:

- Add a simple `asNonEmptyString` check for `subject` (fail fast with `EmailSendError`).
- Optional: add tests covering subject validation, html-only, and provider error mapping.

## Suggested next backlog (smallest-first)

1. ✅ Tighten boolean parsing to fail fast when an invalid value is provided (P1). (done)
2. Split/structure `env.validation.ts` for maintainability (P1).
3. ✅ Clarify or scope `.env` loading semantics (P2). (done)
4. Rename/document DB lock helper naming (P2).
5. Add `subject` validation + broaden email tests (P2).
