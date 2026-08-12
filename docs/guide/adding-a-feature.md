# Adding a Feature

This guide shows how to add business capabilities using the progressive feature
architecture from `docs/adr/0018-progressive-feature-architecture.md`.

## Rule: Feature Owns Its Slice, Layers Are Progressive

A feature owns its HTTP surface, service behavior, persistence adapters, jobs,
and feature-specific rules. Do not create layers before the behavior needs them.

Use the smallest tier that fits:

| Tier                  | Use when                                                                                                      | Typical shape                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Endpoint slice        | Simple CRUD, settings, read/list endpoints, one repository, no complex invariant                              | controller, DTO, service, repository, optional errors, colocated tests                    |
| Capability slice      | Multiple related endpoints share behavior, policies, or persistence                                           | capability folders with controller/service/repository/policy/types and optional `shared/` |
| Clean/hexagonal slice | Auth, money, deletion, queues, transaction-heavy invariants, multiple adapters, framework-free use-case tests | explicit `domain`, `app`, `ports`, and `infra`                                            |

## Steps

0. Scaffold the smallest useful slice (recommended)

- Run `npm run scaffold:feature -- --name <feature-name>`.
- Use `--tier clean` only when the feature needs clean/hexagonal boundaries.
- Optional: add queue skeleton with `--with-queue`.
- Optional: preview without writing files via `--dry-run`.

Examples:

```bash
npm run scaffold:feature -- --name user-preferences
npm run scaffold:feature -- --name billing --tier clean
npm run scaffold:feature -- --name user-preferences --with-queue
npm run scaffold:feature -- --name reporting --dry-run
```

The default scaffold creates a simple endpoint slice:

- module
- controller
- DTO
- service
- Prisma repository
- optional jobs queue files
- baseline tests (`*.spec.ts`) and `test/<feature>.e2e-spec.ts` TODO skeleton

The clean scaffold creates the explicit `app` + `infra` shape for high-risk or
complex features.

1. Start with endpoint/capability code

- Keep route/controller code thin.
- Put Prisma queries in repositories, not controllers.
- Put behavior orchestration in services.
- Add feature-specific error types only when clients need stable branchable
  feature error codes.
- For simple HTTP failures, throw `ProblemException` from
  `libs/platform/http/errors/problem.exception.ts`.

2. Promote only when needed

Promote to `domain/app/infra` when one of these is true:

- business rules must be pure and independently unit-tested;
- one use case needs multiple adapters;
- external side effects must be orchestrated through ports;
- transaction boundaries span multiple repositories or aggregates;
- queue retries, idempotency, or eventual consistency affect correctness;
- auth/session/RBAC/security-sensitive behavior is changing;
- the feature is expected to be extracted or reused outside the Nest HTTP
  process.

3. Expose HTTP endpoints

- Add controllers/modules in the API app wiring.
- Use DTOs + validation and follow the response/error standards.

### Module Assembly Pattern

Simple endpoint-slice services may use Nest `@Injectable`.

Use provider builders from `libs/platform/di/app-service.provider.ts` for pure
app services in clean/hexagonal slices. This keeps module wiring consistent and
removes repeated `useFactory` boilerplate.

Example:

```ts
import {
  provideConstructedAppService,
  provideConstructedClockedAppService,
  provideSystemClockToken,
} from '../../../platform/di/app-service.provider';

providers: [
  PrismaUsersRepository,
  UserAccountDeletionJobs,
  provideSystemClockToken(USERS_CLOCK),
  provideConstructedAppService({
    provide: UsersService,
    inject: [PrismaUsersRepository, UserAccountDeletionJobs, USERS_CLOCK],
    useClass: UsersService,
  }),
  provideConstructedClockedAppService({
    provide: AuthSessionsService,
    inject: [PrismaAuthRepository],
    useClass: AuthSessionsService,
  }),
];
```

Use `provideClockedAppService(...)` when you need custom async factory logic plus a `Clock` (for example, precomputed config values) but still want centralized `SystemClock` injection.

### RBAC wiring checklist

When a feature exposes protected endpoints, wire RBAC at the route boundary:

- [ ] Import `PlatformAuthModule` (for `AccessTokenGuard` + `@CurrentPrincipal()`).
- [ ] Import `PlatformRbacModule` (for `RbacGuard` + `@RequirePermissions()`).
- [ ] Apply `@UseGuards(AccessTokenGuard, RbacGuard)` (authenticate first, then authorize).
- [ ] Set baseline permissions on the controller and add per-handler requirements as needed (`@RequirePermissions(...)` is additive).
- [ ] Add OpenAPI auth + errors: `@ApiBearerAuth('access-token')` and include `UNAUTHORIZED`/`FORBIDDEN` in `@ApiErrorCodes([...])`.
- [ ] Remember: roles normally come from the access token (`roles: string[]`); default is `["USER"]`; unknown roles grant nothing. Use `@UseDbRoles()` when a controller must reflect role changes immediately.
- [ ] Use `@Public()` intentionally when an endpoint should skip auth+RBAC.

See `docs/guide/adding-an-endpoint.md` for copy-paste examples.

4. Tests

- Unit test behavior at the smallest useful boundary.
- Add integration tests for non-trivial repositories (real Postgres).
- Add e2e tests for key flows (HTTP).

5. Docs + OpenAPI

- Update standards references if you introduce new error codes.
- Ensure OpenAPI is generated and contract gates pass.
