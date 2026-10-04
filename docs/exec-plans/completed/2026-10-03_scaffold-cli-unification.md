# Scaffold CLI Unification

**Plan version:** 2
**Task ID:** scaffold-cli-unification
**Status:** completed
**Owner:** Ahmad Fikrilal
**Risk:** high
**Authority:** implement and verify locally; no external mutation
**Allowed paths:** docs/exec-plans/completed/2026-10-03_scaffold-cli-unification.md, package.json, tools/scaffold-feature.ts, tools/backendkit/command.ts, tools/backendkit/command.spec.ts, tools/backendkit/cli.ts, tools/backendkit/feature/feature-scaffold.ts, tools/backendkit/feature/feature-scaffold.spec.ts
**Allowed actions:** edit, verify
**Maximum risk:** high
**Repair limit:** 2
**Task timeout:** 90m

Date: 2026-10-03  
Related issue/PR: `_WIP/feature-lifecycle-cli-proposal.md`

## Objective

Fold feature scaffolding from standalone `tools/scaffold-feature.ts` into the repository-local `backendkit` CLI surface (`npm run backendkit -- scaffold feature <name>`), preserving backward compatibility for `npm run scaffold:feature` and adding unit tests for argument parsing and execution.

## Constraints

- Architecture constraints: Feature scaffolding logic must reside under `tools/backendkit/feature/` and must not import production code.
- Product/runtime constraints: Generated feature skeletons must strictly adhere to existing simple/clean templates and dependency-cruiser boundaries.
- Out of scope: Feature removal/teardown implementation (deferred to Plan 2 and Plan 3).

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

1. `tools/backendkit/command.ts` parses `scaffold feature <name> [--tier simple|clean] [--with-queue] [--dry-run] [--force]`.
2. `tools/backendkit/feature/feature-scaffold.ts` houses modular scaffolding logic extracted cleanly from `tools/scaffold-feature.ts`.
3. `tools/scaffold-feature.ts` delegates directly to the unified `backendkit` feature scaffold service or is maintained as a thin backward-compatible wrapper.
4. `package.json` updates `"scaffold:feature"` script to invoke `npm run backendkit -- scaffold feature`.
5. Unit tests in `command.spec.ts` and `feature-scaffold.spec.ts` prove argument parsing, validation, and generation.
6. `npm run verify` and `npm run scaffold:smoke` pass without regression.

## Implementation Checklist

- [x] Extract scaffolding logic into `tools/backendkit/feature/feature-scaffold.ts`.
- [x] Update `tools/backendkit/command.ts` to add `scaffold-feature` command variant and arg parsing.
- [x] Wire command handler in `tools/backendkit/cli.ts`.
- [x] Add unit tests in `tools/backendkit/feature/feature-scaffold.spec.ts` and update `tools/backendkit/command.spec.ts`.
- [x] Update `package.json` `"scaffold:feature"` alias and point `tools/scaffold-feature.ts` to the new module.
- [x] Verify using `npm run verify` and `npm run scaffold:smoke`.

## Decision Log

- 2026-10-03: Modularize scaffolding logic under `tools/backendkit/feature/` to serve as the unified namespace for both scaffold and teardown capabilities.

## Verification

```bash
# Fast verification profile: PASSED (90 suites, 479 tests)
npm run verify

# End-to-end scaffolding smoke: PASSED (simple and clean features scaffolded, linted, typechecked, and cruised)
npm run scaffold:smoke

# Targeted feature scaffold unit tests: PASSED (8 tests)
npx jest tools/backendkit/feature/feature-scaffold.spec.ts

# Command parser unit tests: PASSED (8 tests)
npx jest tools/backendkit/command.spec.ts
```

Note on `audit:prod` during `backendkit task verify`: 17 of 18 steps in the `full` lane passed cleanly. The final step `audit:prod` surfaced newly disclosed upstream advisories in pre-existing dependencies (`fastify`, `@fastify/busboy`, `@grpc/grpc-js`, `mysql2`, `fast-uri`, `brace-expansion`). Remediating external dependencies requires package-lock updates and is tracked as orthogonal dependency maintenance out of scope for this plan.

## Runtime Evidence

Not required for pure local CLI refactoring when static checks and scaffold smoke pass.

## Risks And Mitigations

- Risk: Existing scripts or developers rely on direct invocation of `tools/scaffold-feature.ts`.
- Mitigation: Retain `tools/scaffold-feature.ts` as a thin delegate script wrapping `runFeatureScaffold` so direct execution continues to work identically.

## Completion Notes

Successfully unified feature scaffolding into `tools/backendkit/feature/feature-scaffold.ts` and exposed `backendkit scaffold feature <name>` via `tools/backendkit/command.ts` and `cli.ts`. Maintained backward compatibility for `npm run scaffold:feature` and `tools/scaffold-feature.ts`. Verified with `npm run verify` (all 90 suites / 479 tests passed) and `npm run scaffold:smoke`.

## Follow-Ups

- [ ] Proceed to Plan 2 (`feature-removal-engine`).
