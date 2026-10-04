# Feature Removal Engine

**Plan version:** 2
**Task ID:** feature-removal-engine
**Status:** completed
**Owner:** Ahmad Fikrilal
**Risk:** high
**Authority:** implement and verify locally; no external mutation
**Allowed paths:** docs/exec-plans/completed/2026-10-03_feature-removal-engine.md, tools/backendkit/feature/module-unwiring.ts, tools/backendkit/feature/module-unwiring.spec.ts, tools/backendkit/feature/baseline-pruner.ts, tools/backendkit/feature/baseline-pruner.spec.ts, tools/backendkit/feature/feature-removal.ts, tools/backendkit/feature/feature-removal.spec.ts
**Allowed actions:** edit, verify
**Maximum risk:** high
**Repair limit:** 2
**Task timeout:** 90m

Date: 2026-10-03  
Related issue/PR: `_WIP/feature-lifecycle-cli-proposal.md`

## Objective

Implement the core feature teardown and unwiring engine: TypeScript module import/provider stripper for NestJS (`app.module.ts` and `worker.module.ts`), architecture smell and duplication baseline pruners, protected core slice safety guards (`auth`, `users`, `admin`), and file deletion orchestrator with dry-run preview capabilities.

## Constraints

- Architecture constraints: Engine must be pure harness tooling under `tools/backendkit/feature/`.
- Product/runtime constraints: Module unwiring must be deterministic and safe against trailing commas, comments, and multiline formatting without corrupting surrounding code.
- Out of scope: User-facing CLI wiring and smoke script integration (deferred to Plan 3).

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

1. `tools/backendkit/feature/module-unwiring.ts` reliably removes import statements and module identifiers from `imports: [...]` or `providers: [...]` in NestJS module source text.
2. `tools/backendkit/feature/baseline-pruner.ts` removes baseline entries and allowlist lines associated with the target feature without corrupting JSON or neighboring keys.
3. `tools/backendkit/feature/feature-removal.ts` executes preflight validation:
   - Validates kebab-case name.
   - Refuses removal of protected core features (`auth`, `users`, `admin`) unless `forceCore` is true.
   - Refuses execution if wiring files have uncommitted modifications unless `force` is true.
   - Accurately builds file deletion matrix (`libs/features/<name>`, `test/<name>.*-spec.ts`, worker job handlers).
4. `--dry-run` accurately returns the planned execution matrix (deletions and modifications) without writing to disk.
5. Unit tests in `module-unwiring.spec.ts`, `baseline-pruner.spec.ts`, and `feature-removal.spec.ts` prove all success and failure branches.
6. `npm run verify` passes cleanly.

## Implementation Checklist

- [x] Create `tools/backendkit/feature/module-unwiring.ts` with unit tests in `module-unwiring.spec.ts`.
- [x] Create `tools/backendkit/feature/baseline-pruner.ts` with unit tests in `baseline-pruner.spec.ts`.
- [x] Create `tools/backendkit/feature/feature-removal.ts` orchestrating preflight, protected core checks, dry-run previews, and execution.
- [x] Add unit tests in `tools/backendkit/feature/feature-removal.spec.ts`.
- [x] Run test suite via `npm test` and `npm run verify`.

## Decision Log

- 2026-10-03: Isolate module unwiring and baseline pruning into separate focused units for high testability and deterministic behavior.
- 2026-10-03: Employ strict TypeScript type narrowing guards (`isRecord`) without type assertions to satisfy strict quality rules.

## Verification

```bash
# Fast verification profile: PASSED (93 suites, 507 tests)
npm run verify

# Feature suite unit tests: PASSED (4 suites, 36 tests)
npx jest tools/backendkit/feature
```

## Runtime Evidence

Not required for pure unit-tested harness engine modules.

## Risks And Mitigations

- Risk: Complex formatting in `app.module.ts` could cause regex-based unwiring to corrupt adjacent imports.
- Mitigation: Cover diverse formatting fixtures (single-line arrays, trailing commas, multi-line blocks, adjacent imports) in `module-unwiring.spec.ts`.

## Completion Notes

Implemented the complete feature removal engine comprising `module-unwiring.ts`, `baseline-pruner.ts`, and `feature-removal.ts` under `tools/backendkit/feature/`. Built comprehensive test coverage across 28 unit tests (36 tests in the feature suite total). All gates in `npm run verify` passed cleanly (93 suites, 507 tests).

## Follow-Ups

- [ ] Proceed to Plan 3 (`feature-lifecycle-integration`).
