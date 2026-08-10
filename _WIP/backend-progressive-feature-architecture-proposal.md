# Backend Progressive Feature Architecture Proposal

- Status: Accepted for planning
- Date: 2026-08-08
- Scope: backend feature structure, endpoint authoring ergonomics, scaffolding, and auth feature organization
- Non-scope: implementing the refactor, changing runtime behavior, changing public API contracts, or accepting an ADR

## Summary

The current backend architecture is production-safe but too heavy as the default way to add product capabilities. A new feature currently starts from `domain/app/infra`, app-layer ports, feature error classes, feature error filters, DTO files, Prisma repositories, module wiring, and multiple test locations. That is defensible for auth, queues, data invariants, and complex workflows, but it is poor ergonomics for simple endpoints.

Adopt a **progressive feature architecture**:

1. Keep the top-level process and platform boundaries: `apps/api`, `apps/worker`, `libs/platform`, `libs/features`, and `libs/shared`.
2. Make the default feature shape smaller and flow-oriented.
3. Introduce `domain`, `app` ports, dedicated adapters, and submodules only when a feature crosses explicit complexity triggers.
4. Move repeated endpoint/error/DTO/scaffold boilerplate into shared backend primitives.
5. Split the current `auth` slice by capability so password auth, OIDC, sessions, email verification, password reset, and push tokens are easier to reason about independently.

This preserves the hard production invariants from the existing docs while reducing the number of files and concepts needed for normal endpoint work.

The previously open defaults are accepted:

- Simple endpoint-slice services may use Nest `@Injectable`; clean/app-layer services stay plain framework-free classes.
- Internal feature common code uses `shared/`.
- The default simple feature scaffold does not generate an error file unless feature-specific branchable failures exist.
- The first auth reorganization keeps one repository facade; repository internals can split later if navigation remains poor.
- This proposal remains in `_WIP/` until the durable decision is recorded as an ADR and normative docs are updated.

## Current context

The source-of-truth architecture defines this backend as a modular monolith with a separate worker process. Features currently own `domain`, `app`, and `infra` layers, and dependency direction is `infra -> app -> domain`.

Relevant current sources:

- `docs/core/project-architecture.md`
- `docs/adr/0011-repository-layout-apps-and-libs.md`
- `docs/adr/0014-enforce-architecture-boundaries.md`
- `docs/adr/0017-standardize-app-errors-and-clock.md`
- `docs/guide/adding-a-feature.md`
- `docs/guide/adding-an-endpoint.md`
- `.dependency-cruiser.cjs`
- `tools/scaffold-feature.ts`

The current scaffold encodes the full baseline. It creates app service/error/port files, infra module/controller/DTO/filter/repository files, TODO tests, and optional queue files. After scaffolding, it still requires manual `AppModule` wiring. This makes the heavy architecture the path of least resistance, even for simple features.

The existing platform already solves several cross-cutting concerns well:

- response envelopes via `ResponseEnvelopeInterceptor`;
- RFC7807 problem details via `ProblemDetailsFilter`;
- feature error mapping via `mapFeatureErrorToProblem`;
- request IDs and validation in API bootstrap;
- access-token guard and RBAC primitives;
- Redis-backed idempotency;
- queue producer/worker abstractions;
- Prisma service and transaction helpers.

The issue is not the platform foundation. The issue is that feature-level ceremony has not been compressed enough.

## Goals

- Make adding a normal endpoint feel small, direct, and predictable.
- Keep backend safety rules: strict TypeScript, no `any`, OpenAPI gates, response envelope, problem details, request IDs, idempotency where relevant, and dependency boundary checks.
- Keep persistence behind repository code, but do not require app-layer interfaces for every simple database operation.
- Make auth navigable by capability instead of a single large slice with many unrelated files.
- Update scaffolding and docs so the simple path is the default path.
- Preserve an upgrade path from simple feature shape to complex feature shape without large rewrites.

## Non-goals

- Do not remove NestJS, Fastify, Prisma, BullMQ, Redis, OpenAPI, or the separate worker process.
- Do not move to a multi-package monorepo.
- Do not weaken API response or error contract standards.
- Do not collapse all backend code into a single `src/` folder.
- Do not rewrite auth behavior as part of this proposal.
- Do not make repository queries live inside controllers.
- Do not add speculative generic abstractions that hide important backend behavior.

## Proposed architecture

### 1. Keep top-level boundaries stable

Retain:

```text
apps/api/        API process bootstrap
apps/worker/     worker process bootstrap
libs/platform/   reusable platform infrastructure
libs/features/   product and domain capabilities
libs/shared/     framework-free shared contracts/utilities
```

This avoids invalidating the durable decisions in ADR 0011 and the existing process model. The proposal changes the **inside of a feature**, not the repository’s top-level shape.

### 2. Introduce progressive feature tiers

Use three feature tiers. Start at the lowest tier that fits the behavior.

| Tier                  | Use when                                                                                                               | Shape                                                                                             | Avoid by default                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Endpoint slice        | Simple CRUD, small account settings, read/list endpoints, one repository, no complex domain invariant                  | controller, DTO, service, repository, optional errors, colocated tests                            | separate `domain`, app-layer port interface, feature-specific error filter |
| Capability slice      | Multiple related endpoints sharing behavior, policies, or persistence                                                  | capability folder with controller/service/repository/policy/types, optional shared feature module | splitting every operation into its own clean-architecture stack            |
| Clean/hexagonal slice | Auth, money, deletion, queue workflows, transaction-heavy invariants, multiple adapters, framework-free use-case tests | explicit `domain`, `app`, `ports`, `infra` boundaries                                             | direct framework/persistence dependencies in app/domain code               |

Default new feature shape:

```text
libs/features/preferences/
  preferences.module.ts
  preferences.controller.ts
  preferences.dto.ts
  preferences.service.ts
  prisma-preferences.repository.ts
  preferences.errors.ts          # only when feature-specific errors exist
  preferences.spec.ts
```

If the feature grows:

```text
libs/features/preferences/
  preferences.module.ts
  profile/
    profile.controller.ts
    profile.dto.ts
    profile.service.ts
    prisma-profile.repository.ts
    profile.errors.ts
  notifications/
    notifications.controller.ts
    notifications.dto.ts
    notifications.service.ts
    prisma-notifications.repository.ts
```

If the feature needs strong domain isolation:

```text
libs/features/billing/
  domain/
  app/
  infra/
```

This keeps Clean Architecture available, but not mandatory for trivial code.

### 3. Define promotion triggers

Promote from endpoint/capability slice to explicit `domain/app/infra` only when at least one trigger is present:

- business rules must be pure and independently unit-tested;
- one use case needs multiple adapters;
- persistence and external side effects must be orchestrated through ports;
- transaction boundaries span multiple repositories or aggregates;
- queue retries, idempotency, or eventual consistency affect correctness;
- auth/session/RBAC/security-sensitive behavior is being changed;
- the feature is expected to be extracted or reused outside the Nest HTTP process;
- repository behavior is complex enough that a framework-free app test materially improves confidence.

Do not promote only because “every feature should have layers.”

### 4. Centralize endpoint boilerplate

Add platform helpers so simple controllers do not repeat the same decorators and error mapping manually.

Recommended primitives:

- `ProblemException` for simple HTTP failures with typed `AppErrorCode`, status,
  issues, and optional retry-after handling in feature-specific filters only
  when needed.
- The global `ProblemDetailsFilter` handles the common RFC7807 response shape.
- Decorator helpers for common protected endpoints:
  - auth + bearer + standard errors;
  - idempotency header + idempotency error codes;
  - list response metadata;
  - common operation ID conventions.
- DTO/envelope helpers or documented patterns that reduce per-endpoint envelope DTO duplication without breaking OpenAPI.

Current feature-specific filters are nearly identical:

- `libs/features/auth/infra/http/auth-error.filter.ts`
- `libs/features/users/infra/http/users-error.filter.ts`
- `libs/features/admin/infra/http/admin-error.filter.ts`

The custom behavior that remains feature-specific should be explicit. For example, `UserNotFoundError` currently maps to `401 Unauthorized` for unusable principals. That special case should stay local or be modeled as an explicit error code/status, not hidden in a generic filter.

### 5. Make repository interfaces optional

Keep repository classes as the persistence boundary. Do not require an app-layer port interface until it buys something concrete.

Default:

```text
service -> PrismaXRepository
```

Use a port interface when:

- the app service must be framework-free;
- the use case needs fake ports for meaningful unit tests;
- there are multiple implementations;
- the repository boundary is part of a stable domain contract.

This keeps the database standard’s intent—queries do not live in controllers or business logic—without making every simple endpoint pay for adapter indirection.

### 6. Split auth by capability

The current auth slice contains password auth, OIDC, token/session lifecycle, email verification, password reset, push tokens, rate limiting, token issuance, security adapters, repositories, jobs, controllers, filters, DTOs, and tests under one feature tree. The files are individually reasonable, but the slice has high cognitive load.

Refactor auth internally by capability:

```text
libs/features/auth/
  auth.module.ts
  shared/
    auth.errors.ts
    auth.error-codes.ts
    auth.types.ts
    auth.config.ts
    auth.repository.ts
    prisma-auth.repository.ts
    auth-user-state.ts
    security/
      argon2.password-hasher.ts
      crypto-access-token-issuer.ts
      google-oidc-id-token-verifier.ts
  password/
    password-auth.controller.ts
    password-auth.dto.ts
    password-auth.service.ts
    password-reset.service.ts
    password-reset.jobs.ts
    password-reset.job.ts
    password-reset-token.ts
  oidc/
    oidc.controller.ts
    oidc.service.ts
  sessions/
    sessions.controller.ts
    sessions.service.ts
    session-lifecycle.service.ts
    refresh-token.ts
  email-verification/
    email-verification.controller.ts
    email-verification.service.ts
    email-verification.jobs.ts
    email-verification.job.ts
    email-verification-token.ts
  push-tokens/
    push-token.controller.ts
    push-tokens.service.ts
```

Keep a single public `AuthModule` so API wiring does not scatter auth capabilities across `apps/api/src/app.module.ts`.

The split should be a behavior-preserving move first. Do not redesign token semantics, password reset semantics, or rate limiting during the folder refactor.

### 7. Update scaffolding to encode the new default

Replace or extend `npm run scaffold:feature` with modes:

```bash
npm run scaffold:feature -- --name preferences
npm run scaffold:feature -- --name billing --tier clean
npm run scaffold:endpoint -- --feature preferences --name update-profile --method PATCH --path me/preferences
```

The default scaffold should generate the endpoint-slice shape. The clean tier should remain available for complex domains.

The scaffold smoke test should validate both the default simple scaffold and the clean scaffold. This preserves the guardrail that generated code must lint, typecheck, and pass dependency checks.

## Proposed request flow

For a simple endpoint:

```text
HTTP request
  -> controller DTO validation / guards / idempotency decorators
  -> feature service
  -> feature repository
  -> Prisma/Postgres
  -> service view model
  -> response envelope interceptor
```

For a complex endpoint:

```text
HTTP request
  -> infra controller
  -> app use case
  -> domain rules
  -> app port
  -> infra adapter / repository / queue producer
  -> response envelope interceptor
```

The second path remains available. The first path becomes the default.

## Invariants

- `libs/platform/*` must not import `libs/features/*`.
- `libs/shared/*` must stay framework-free.
- Domain code, when present, must stay pure.
- App/use-case code, when present, must stay framework-free.
- Successful JSON responses still use `{ data, meta? }`.
- Errors still use RFC7807 problem details with stable `code` and `traceId`.
- OpenAPI snapshot generation and linting remain required for controller/DTO changes.
- App-layer time-sensitive behavior still uses `Clock`; direct wall-clock reads remain constrained.
- Write endpoints that clients may retry still use idempotency.
- Repository code remains the home for Prisma queries.
- Auth/session/RBAC changes remain high risk and require targeted tests plus runtime evidence when static checks are insufficient.

## Compatibility and rollout

This can be rolled out without changing runtime API behavior.

Recommended order:

1. Add proposal acceptance ADR after review, because this supersedes parts of ADR 0011 and ADR 0014 around mandatory internal feature layout.
2. Update architecture docs to describe progressive feature tiers.
3. Update dependency-cruiser rules so they enforce purity only when `domain` or `app` folders exist, and still prevent platform-to-feature imports and cycles.
4. Add shared endpoint/error primitives.
5. Update scaffold templates and scaffold smoke tests.
6. Migrate one small non-auth feature or endpoint as a proving slice.
7. Split auth by capability as a separate behavior-preserving refactor.

Do not start with auth. Auth is the highest cognitive-load example, but it is also security-sensitive. Prove the structure with a smaller slice first.

## Risks and tradeoffs

| Risk                                            | Impact                                     | Mitigation                                                                                        |
| ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Simpler layout becomes a junk drawer            | Feature code may lose boundaries over time | Keep `libs/features/<feature>` ownership, add promotion triggers, and enforce cycles/import rules |
| Removing mandatory ports reduces test isolation | Some services may be harder to unit test   | Require ports when framework-free use-case tests provide real value                               |
| Generic error filter hides special cases        | Incorrect status/code mapping              | Keep special mappings explicit; generic filter only handles the common base error                 |
| Auth split causes behavior drift                | Token/session regressions                  | Move files first, keep public module stable, run auth e2e/int suites and OpenAPI gates            |
| Existing docs/ADRs conflict with new structure  | Agents may follow stale guidance           | Update docs and add superseding ADR before broad migration                                        |
| Scaffold becomes too configurable               | New contributors may be confused           | Keep one default mode and one explicit `--tier clean` mode                                        |

## Acceptance criteria

The accepted architecture direction is ready to execute when these are true:

- A superseding ADR accepts progressive feature tiers or explicitly rejects them.
- `docs/core/project-architecture.md`, `docs/guide/adding-a-feature.md`, and `docs/guide/adding-an-endpoint.md` describe the simple default path.
- Dependency checks support simple feature folders while preserving platform/shared/domain/app constraints.
- The default scaffold creates a working simple feature with fewer files than the current clean scaffold.
- The clean scaffold remains available for complex features.
- Shared endpoint/error primitives remove the need for one-off feature filters in normal cases.
- A proving slice demonstrates the new shape without changing public API behavior.
- Auth is reorganized only after the proving slice passes verification.

## Accepted defaults

These defaults are accepted for the execution plan and ADR draft:

1. Simple endpoint-slice services may import Nest `@Injectable`.

   Clean/app-layer services remain plain framework-free classes. This keeps the simple path low-friction without weakening the explicit clean slice.

2. Feature-internal common code uses `shared/`.

   Avoid underscore conventions unless tooling needs them.

3. The default simple scaffold does not include an error file.

   Generate feature errors only when the endpoint has feature-specific branchable failures.

4. Auth keeps one repository facade during the first folder split.

   Split repository internals later only if repository files remain hard to navigate after the capability split.

5. This proposal remains in `_WIP/`.

   Durable decisions move into a superseding ADR and normative docs. The proposal should not become a permanent parallel source of truth.
