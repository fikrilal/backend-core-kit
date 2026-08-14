# Backendkit CLI

`backendkit` is the repository-local command surface for backend harness
orchestration. It owns verification profile composition and delegates each
check to the existing npm sensor that already owns that behavior.

## Commands

```bash
npm run backendkit -- --help
npm run backendkit -- verify
npm run backendkit -- verify --profile fast
npm run backendkit -- verify --profile full
npm run backendkit -- verify --profile runtime
npm run backendkit -- verify --profile ci
```

## Profiles

| Profile   | Purpose                                                                      |
| --------- | ---------------------------------------------------------------------------- |
| `fast`    | Deterministic static checks and unit tests; used by `npm run verify`         |
| `full`    | Complete non-Docker CI-equivalent checks; used by `npm run verify:ci-local`  |
| `runtime` | Docker-backed migrations, integration, and E2E; used by `npm run verify:e2e` |
| `ci`      | `full` followed by `runtime`; used by hosted CI through `npm run verify:ci`  |

The typed registry under `tools/backendkit/verification/` is the source of
truth for profile order. CI and compatibility aliases must call these profiles
instead of copying their step lists.

## Ownership

- `tools/backendkit/process-runner.ts` owns structured subprocess execution.
- `tools/backendkit/verification/profile-registry.ts` owns profile composition.
- `tools/backendkit/verification/run-profile.ts` owns fail-fast execution and
  profile output.
- Existing scripts and npm commands continue to own OpenAPI, Prisma, env,
  architecture, duplication, tests, and runtime dependency behavior.

The CLI is harness tooling. Production code under `apps/` and `libs/` must not
import it.

The runtime profile preserves the documented default dependency ports. When
another local stack owns those ports, the Compose-only `POSTGRES_HOST_PORT`,
`REDIS_HOST_PORT`, `MINIO_API_HOST_PORT`, and `MINIO_CONSOLE_HOST_PORT`
variables may select alternate host ports. Supply matching `DATABASE_URL`,
`REDIS_URL`, and `STORAGE_S3_ENDPOINT` values to the runtime profile. These
host-port controls are development harness settings, not application config.

## Compatibility

Keep `verify`, `verify:ci-local`, and `verify:e2e` stable for developers and
automation. They are aliases, not independent pipeline definitions.

When adding or changing a profile step:

1. update the typed registry;
2. update focused profile/parity tests;
3. update this reference and relevant standards;
4. treat the change as high-risk harness work;
5. verify locally and through clean-checkout CI.
