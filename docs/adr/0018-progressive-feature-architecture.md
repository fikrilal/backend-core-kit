# ADR: Progressive Feature Architecture

- Status: Accepted
- Date: 2026-08-08
- Decision makers: Core kit maintainers

## Context

The core kit currently documents every business feature as a vertical slice with
`domain`, `app`, and `infra` layers. This shape is enforced by guidance and by
dependency boundary checks.

That structure remains valuable for complex backend behavior, especially auth,
RBAC, data deletion, queues, external integrations, transaction-heavy workflows,
and domain rules that need framework-free tests. It is too much ceremony as the
default for simple endpoints.

The current default path makes small feature work expensive:

- a new feature starts with app service, app errors, app port, infra repository,
  infra controller, DTOs, feature filter, module wiring, and tests;
- `tools/scaffold-feature.ts` encodes the full clean-architecture baseline;
- simple endpoints must understand more folders and indirection than their
  behavior requires;
- large features such as auth accumulate too much cognitive load when many
  capabilities live under one technical-layer slice.

We want backend feature authoring to be DRY and KISS while preserving production
constraints: strict TypeScript, API envelopes, RFC7807 errors, OpenAPI gates,
request IDs, idempotency where relevant, repository-owned Prisma queries,
dependency boundaries, and security-sensitive review discipline.

## Decision

Adopt a **progressive feature architecture**.

The top-level repository layout remains:

```text
apps/api/        API process bootstrap
apps/worker/     worker process bootstrap
libs/platform/   reusable platform infrastructure
libs/features/   product and domain capabilities
libs/shared/     framework-free shared contracts/utilities
```

Inside `libs/features/*`, start with the smallest shape that fits current
behavior and promote only when complexity justifies it.

### Feature tiers

| Tier                  | Use when                                                                                                      | Default shape                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Endpoint slice        | Simple CRUD, settings, read/list endpoints, one repository, no complex invariant                              | controller, DTO, service, repository, optional errors, colocated tests                              |
| Capability slice      | Multiple related endpoints share behavior, policies, or persistence                                           | capability folders with controller/service/repository/policy/types and optional feature-shared code |
| Clean/hexagonal slice | Auth, money, deletion, queues, transaction-heavy invariants, multiple adapters, framework-free use-case tests | explicit `domain`, `app`, `ports`, and `infra` boundaries                                           |

Promotion from endpoint/capability slice to clean/hexagonal slice should happen
when at least one of these triggers exists:

- business rules must be pure and independently unit-tested;
- one use case needs multiple adapters;
- external side effects must be orchestrated through ports;
- transaction boundaries span multiple repositories or aggregates;
- queue retries, idempotency, or eventual consistency affect correctness;
- auth/session/RBAC/security-sensitive behavior is changing;
- the feature is expected to be extracted or reused outside the Nest HTTP
  process;
- repository behavior is complex enough that framework-free app tests materially
  improve confidence.

Do not create `domain/app/infra` only because every feature historically used
that shape.

### Accepted defaults

- Simple endpoint-slice services may use Nest `@Injectable`.
- Clean/app-layer services remain plain framework-free classes.
- Feature-internal common code uses `shared/`.
- The default simple scaffold does not generate an error file unless
  feature-specific branchable failures exist.
- Auth keeps one repository facade during the first capability-folder split.
  Repository internals can split later if navigation remains poor.
- Accepted proposals stay in `_WIP/`; durable decisions are recorded in ADRs and
  normative docs.

### Boundary enforcement

Dependency checks must adapt to this model:

- `libs/platform/*` must not depend on `libs/features/*`;
- `libs/shared/*` must stay framework-free;
- `domain` folders, when present, must stay pure;
- `app` folders, when present, must stay framework-free and must not import
  feature infra;
- feature folders must still avoid cycles and app/process imports.

This supersedes the prior assumption that every feature has mandatory
`domain/app/infra` internals. It does not supersede the top-level `apps/` +
`libs/` layout or the platform/feature/shared ownership rules.

## Rationale

This keeps the architecture proportional to risk.

Small endpoints should not require ports, feature filters, and clean-layer
folders before there is a real need. Backend safety should come from stable
platform primitives, contracts, tests, and focused boundaries, not repeated
boilerplate.

Clean Architecture remains available where it pays for itself. Auth and other
high-risk capabilities still benefit from explicit framework-free use cases,
ports, deterministic time, and carefully isolated adapters.

The progressive model also improves feature navigation. Large features can group
by capability rather than accumulating unrelated behavior in one technical-layer
tree.

## Consequences

Positive:

- Adding a normal endpoint requires fewer files and less architectural context.
- Scaffolding can encode a smaller default path.
- Feature folders can grow from simple to complex without a full upfront stack.
- Auth can be split by capability without changing API wiring or behavior.
- Shared endpoint/error primitives can remove repeated feature filter and
  decorator boilerplate.

Costs:

- Existing docs and guardrails must be updated to describe feature tiers.
- Dependency-cruiser rules need to enforce optional `domain`/`app` boundaries
  instead of assuming those folders always exist.
- Scaffolding must support at least a simple default and an explicit clean tier.
- Existing large features, especially auth, need behavior-preserving file moves
  if we want the new structure to apply retroactively.

Risks:

- A simpler layout can become a junk drawer if promotion triggers are ignored.
- Direct `service -> repository` dependencies reduce app-layer port isolation for
  simple features.
- Generic error primitives can hide special mappings if special cases are not
  kept explicit.
- Auth reorganization can cause behavior drift if done before docs, guardrails,
  and a smaller proving slice.

Mitigation:

- Keep top-level feature ownership and cycle checks.
- Require clean/hexagonal slices for high-risk triggers.
- Keep repository classes as the persistence boundary.
- Prove the model on a small non-auth slice before reorganizing auth.
- Run relevant verification gates before and after capability moves.

## Alternatives Considered

- Keep mandatory `domain/app/infra` for every feature.
  - Rejected because it optimizes for theoretical future complexity and makes
    simple endpoint work too expensive.
- Collapse all features into a flat `src/` tree.
  - Rejected because it weakens process/platform/feature ownership and risks
    turning the backend into an unbounded shared folder.
- Remove repository boundaries and put Prisma directly in services/controllers.
  - Rejected because persistence queries should remain isolated and testable.
- Refactor auth first.
  - Rejected as the first step because auth is security-sensitive. The structure
    should be proven on a smaller slice before moving auth files.
- Keep feature-specific error filters everywhere.
  - Rejected for normal endpoints because the current filters are mostly
    repeated boilerplate. Special cases should remain explicit.

## Links / References

- Related ADRs:
  - `docs/adr/0011-repository-layout-apps-and-libs.md`
  - `docs/adr/0014-enforce-architecture-boundaries.md`
  - `docs/adr/0017-standardize-app-errors-and-clock.md`
- Related docs:
  - `docs/core/project-architecture.md`
  - `docs/guide/adding-a-feature.md`
  - `docs/guide/adding-an-endpoint.md`
  - `docs/standards/code-quality.md`
  - `docs/standards/database.md`
  - `docs/engineering/guardrails.md`
- Related proposal:
  - `_WIP/backend-progressive-feature-architecture-proposal.md`
