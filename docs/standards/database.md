# Database Standard (Postgres + Prisma)

This document defines baseline patterns for Postgres usage with Prisma.

## Principles

- Migrations are reproducible and committed.
- Writes are transactional where invariants span multiple tables.
- Repositories isolate persistence from business logic.
- Audit fields are standard and consistent.

## Migrations

Rules:

- All schema changes go through Prisma migrations.
- Migrations may enable required Postgres extensions (e.g., `pgcrypto` for `gen_random_uuid()`).
- CI/CD should run `prisma migrate deploy` (or equivalent) as a gated step.
- Migration scripts must be safe, reversible where practical, and reviewed.

Current scaffolding:

- Prisma schema: `prisma/schema.prisma` (schema only; no datasource URL in Prisma 7)
- Prisma config: `prisma.config.ts` (schema path + datasource URL for Prisma CLI)
- Scripts: `npm run prisma:generate`, `npm run prisma:migrate`, `npm run prisma:migrate:deploy`
- Prisma client wiring: `libs/platform/db/prisma.service.ts` (Postgres driver adapter via `@prisma/adapter-pg`)

## Repository Pattern

Baseline structure:

- `domain`: pure domain types and invariants
- `app`: use-cases call repositories via interfaces (“ports”)
- `infra`: Prisma repositories implement those ports

Rules:

- Services/use-cases must not embed raw Prisma queries directly (keep queries in repositories).
- Repositories must not contain domain decisions; they only persist/fetch.

## Transactions

Use transactions for multi-step writes:

- Prisma `$transaction` (or a wrapper) should be used for “all-or-nothing” operations.
- Prefer passing a transaction-scoped Prisma client to repositories rather than using globals.

## Audit Fields

Recommended baseline fields on most tables:

- `createdAt`, `updatedAt`
- `createdBy`, `updatedBy` (when changes are attributable to a user/service principal)

Rules:

- `updatedAt` must update on every mutation.
- `createdBy/updatedBy` should come from request/job context where available.

## Soft Delete (Optional Baseline)

Soft delete is often needed for consumer apps and compliance:

- Add `deletedAt` (nullable timestamp).
- Default reads should exclude `deletedAt != null`.

If a project does not need soft-delete, do not add it everywhere “just because”.

## Seeds and Test Strategy

Baseline:

- Seed scripts exist for local dev convenience.
- Integration tests run against a real Postgres instance (Docker Compose or Testcontainers).
- Tests must be isolated and reproducible (no reliance on developer machine state).
