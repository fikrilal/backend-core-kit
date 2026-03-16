# Type Assertion Cleanup TODO

Date: 2026-03-16
Scope: `apps/*`, `libs/*`, `test/*`, `eslint.config.mjs`, `AGENTS.md`
Status: Done

## Goal

Remove `as`-based type assertions that silence TypeScript and replace them with:

- inference
- narrowing
- generics
- runtime validation
- explicit mapping functions

Cleanup standard for each batch:

- safer types
- less repetition
- improved readability
- improved simplicity

This work is now enforced by lint:

- `@typescript-eslint/no-unnecessary-type-assertion: error`
- `@typescript-eslint/consistent-type-assertions: ['error', { assertionStyle: 'never' }]`

## Baseline

Lint status after enabling the rules:

- `568` total errors
- `562` from `@typescript-eslint/consistent-type-assertions`
- `6` from `@typescript-eslint/no-unnecessary-type-assertion`

Notes:

- Most failures are in tests.
- Highest-signal cleanup is in production boundary code first.
- `as const` is allowed by the lint rule and is not the target of this cleanup.

## Cleanup Order

## 1. HTTP Boundaries

Why first:

- Raw framework input enters here.
- These files convert `unknown` and framework responses into app-level shapes.
- Fixing these improves safety across the whole request/response surface.

TODO:

- [x] Replace object-shape assertions in [response-envelope.interceptor.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/http/interceptors/response-envelope.interceptor.ts)
- [x] Replace `HttpException#getResponse()` assertions with guarded parsing in [problem-details.filter.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/http/filters/problem-details.filter.ts)
- [x] Replace Fastify raw request mutation assertions with typed wrapper/interface extension in [fastify-hooks.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/http/fastify-hooks.ts)
- [x] Remove adapter response-object assertions in [fastify-adapter.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/http/fastify-adapter.ts)
- [x] Remove request/response serializer assertions in [logging.module.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/logging/logging.module.ts)

## 2. Prisma to Domain Mapping

Why second:

- These casts hide schema drift between Prisma enums/strings and domain types.
- This is core business-data translation, so silent mismatches are expensive.

TODO:

- [x] Replace enum/string casts with explicit mapping in [prisma-auth.repository.mappers.ts](/home/fikrilal/devs/core/backend-core-kit/libs/features/auth/infra/persistence/prisma-auth.repository.mappers.ts)
- [x] Replace user role/status casts in [prisma-users.repository.ts](/home/fikrilal/devs/core/backend-core-kit/libs/features/users/infra/persistence/prisma-users.repository.ts)
- [x] Replace admin user role/status casts in [prisma-admin-users.query-builders.ts](/home/fikrilal/devs/core/backend-core-kit/libs/features/admin/infra/persistence/prisma-admin-users.query-builders.ts)
- [x] Replace audit action/role casts in [prisma-admin-audit.query-builders.ts](/home/fikrilal/devs/core/backend-core-kit/libs/features/admin/infra/persistence/prisma-admin-audit.query-builders.ts)
- [x] Replace Prisma error `meta` shape assertions with guards in [prisma-auth.repository.prisma-errors.ts](/home/fikrilal/devs/core/backend-core-kit/libs/features/auth/infra/persistence/prisma-auth.repository.prisma-errors.ts)

## 3. JSON.parse and Payload Decoding

Why third:

- These are mechanical, high-leverage fixes.
- `JSON.parse` should produce `unknown` and then be validated.

TODO:

- [x] Add guarded cursor payload parsing in [cursor.ts](/home/fikrilal/devs/core/backend-core-kit/libs/shared/list-query/cursor.ts)
- [x] Replace token payload assertions in [access-token-verifier.service.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/auth/access-token-verifier.service.ts)
- [x] Replace signing-key JSON assertions in [auth-keyring.service.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/auth/auth-keyring.service.ts)
- [x] Replace push config JSON assertions in [fcm-push.service.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/push/fcm-push.service.ts)
- [x] Replace idempotency payload assertions in [idempotency.core.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/http/idempotency/idempotency.core.ts)

## 4. Auth and Security-Sensitive Dynamic Boundaries

Why fourth:

- These are security-sensitive.
- Assertions here can hide bad assumptions about key material or external modules.

TODO:

- [x] Replace dynamic module import assertions with guarded module validation in [google-oidc-id-token-verifier.ts](/home/fikrilal/devs/core/backend-core-kit/libs/features/auth/infra/security/google-oidc-id-token-verifier.ts)
- [x] Replace JWK assertions and double-casts in [auth-keyring.service.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/auth/auth-keyring.service.ts)

## 5. Queue and Worker Generics

Why fifth:

- These are important but lower signal than HTTP/auth/Prisma boundaries.
- Most of this is generic typing cleanup, not untrusted-input parsing.

TODO:

- [x] Remove generic payload/job assertions in [queue.producer.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/queue/queue.producer.ts)
- [x] Replace worker job assertions with typed dispatch or helper wrappers in [users-account-deletion.worker.ts](/home/fikrilal/devs/core/backend-core-kit/apps/worker/src/jobs/users-account-deletion.worker.ts)

## 6. Shared Query Utilities

Why sixth:

- These are reused broadly.
- Fixes here reduce repeated assertion patterns elsewhere.

TODO:

- [x] Replace field-list assertions in [sort.ts](/home/fikrilal/devs/core/backend-core-kit/libs/shared/list-query/sort.ts)
- [x] Replace object/field assertions in [filter.ts](/home/fikrilal/devs/core/backend-core-kit/libs/shared/list-query/filter.ts)
- [x] Replace filter-object assertion in [list-query.ts](/home/fikrilal/devs/core/backend-core-kit/libs/shared/list-query/list-query.ts)
- [x] Replace decorator/filter config assertions in [api-list-query.decorator.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/http/list-query/api-list-query.decorator.ts)
- [x] Replace decorator cast in [list-query.decorator.ts](/home/fikrilal/devs/core/backend-core-kit/libs/platform/http/list-query/list-query.decorator.ts)

## 7. Tests and Test Harnesses

Why last:

- Largest volume.
- Lowest production-safety return per edit.
- Still necessary to get lint green.

TODO:

- [x] Convert simple response-body assertions to typed helper functions in `test/auth/*.e2e-spec.ts`
- [x] Replace mocked service double-casts in `libs/platform/**/*.spec.ts`
- [x] Replace worker/job double-casts in `apps/worker/**/*.spec.ts` and `test/*.int-spec.ts`
- [x] Introduce reusable typed test factories/helpers where repeated cast patterns exist

## Suggested Execution Pattern

For each file touched:

1. Remove the assertion.
2. Replace it with one of:
   - a type guard
   - a parser/validator
   - an explicit mapper
   - a better generic signature
   - a typed wrapper/helper
3. Run lint on the file or package area.
4. Run relevant tests before moving on.

## Done Criteria

- [x] `npm run lint` passes
- [x] No production code uses `as` to silence TypeScript
- [x] Remaining assertion-style `as` usage is eliminated; only allowed forms like `as const` remain
- [x] Boundary parsing/mapping logic is explicit and test-covered

## Notes

- Do not weaken the new lint rules.
- Do not replace `as` with `@ts-ignore` or equivalent suppression.
- Prefer small batches by boundary area instead of broad refactors.
- Apply DRY when the repeated knowledge is real and local; do not introduce abstractions that reduce clarity.
