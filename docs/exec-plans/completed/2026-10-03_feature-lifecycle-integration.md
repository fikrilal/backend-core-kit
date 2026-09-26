# Feature Lifecycle Integration

**Plan version:** 2
**Task ID:** feature-lifecycle-integration
**Status:** completed
**Owner:** Ahmad Fikrilal
**Risk:** low
**Authority:** implement and verify locally; no external mutation
**Allowed paths:** docs/exec-plans/active/2026-10-03_feature-lifecycle-integration.md, docs/exec-plans/completed/2026-10-03_feature-lifecycle-integration.md, package.json, tools/backendkit/command.ts, tools/backendkit/command.spec.ts, tools/backendkit/cli.ts, tools/backendkit/feature/feature-removal.ts, tools/backendkit/feature/removal-confirmation.ts, tools/backendkit/feature/removal-confirmation.spec.ts, scripts/scaffold-smoke.ts, docs/engineering/backendkit-cli.md, _WIP/feature-lifecycle-cli-proposal.md
**Allowed actions:** edit, verify
**Maximum risk:** low
**Repair limit:** 2
**Task timeout:** 90m

Date: 2026-10-03  
Related issue/PR: `_WIP/feature-lifecycle-cli-proposal.md`

## Objective

Wire the feature removal engine into the `backendkit` CLI surface (`npm run backendkit -- remove feature <name>`), expose package script `"remove:feature"`, extend `scripts/scaffold-smoke.ts` to perform end-to-end round-trip verification (scaffold -> wire -> verify -> remove -> verify), and update harness documentation.

## Constraints

- Architecture constraints: CLI parsing and dispatch must adhere strictly to `tools/backendkit/command.ts` conventions.
- Product/runtime constraints: Extended scaffold smoke script must cleanly clean up temporary files in both success and failure cases.
- Out of scope: Automated database migrations reversal or dropping Prisma tables.

## Impact Areas

- API/OpenAPI: yes
- DB/Prisma/migrations: no
- Auth/session/RBAC: no
- Queue/jobs: no
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: no
- CI/release/harness: yes

## Acceptance Criteria

1. `tools/backendkit/command.ts` parses `remove feature <name> [--dry-run] [--yes] [--force-core] [--force]`.
2. `tools/backendkit/cli.ts` dispatches `remove feature` to `FeatureRemovalService` and formats execution reports.
3. `package.json` includes `"remove:feature": "npm run backendkit -- remove feature"`.
4. `scripts/scaffold-smoke.ts` exercises full round-trip:
   - Scaffolds clean and simple features with queue.
   - Wires them into `app.module.ts`.
   - Runs `typecheck`, `lint`, and `deps:check`.
   - Executes `remove feature` with `--yes`.
   - Confirms complete unwiring and that `typecheck`, `lint`, and `deps:check` still pass.
5. `docs/engineering/backendkit-cli.md` documents `scaffold feature` and `remove feature` commands, options, and invariants.
6. `npm run verify` and `npm run verify:ci-local` pass cleanly.

## Implementation Checklist

- [x] Update `tools/backendkit/command.ts` with `remove-feature` command type, arg parser, and tests in `command.spec.ts`.
- [x] Connect `remove feature` execution in `tools/backendkit/cli.ts`.
- [x] Add `"remove:feature"` script alias to `package.json`.
- [x] Extend `scripts/scaffold-smoke.ts` with scaffold-wire-remove lifecycle smoke test.
- [x] Update `docs/engineering/backendkit-cli.md` with new feature commands.
- [x] Run `npm run verify:ci-local` and ensure full CI-mirror passes.

## Decision Log

- 2026-10-03: Extend existing `scripts/scaffold-smoke.ts` rather than adding a separate teardown smoke script, keeping smoke test execution unified and fast in CI.
- 2026-10-03: Expose `yes?: boolean` in `RemoveFeatureOptions` and enforce `--yes` confirmation check in `cli.ts` (prompts via `readline` in interactive TTY, fails closed with informative error in non-interactive CI).
- 2026-10-03: Address review findings: extract confirmation logic to `removal-confirmation.ts` with unit tests, treat EOF/closed prompts as an abort with a non-zero exit code, assert smoke wiring anchors, and correct `--with-queue` documentation.

## Verification

```bash
npm run verify
npm run scaffold:smoke
npm run verify:ci-local
```

## Runtime Evidence

Not required for CLI tooling and smoke test extensions.

## Risks And Mitigations

- Risk: Scaffold smoke failure leaves temporary features behind.
- Mitigation: Retain try/finally cleanup block in `scripts/scaffold-smoke.ts` to ensure all temporary feature artifacts are purged even on failure.

## Completion Notes

- CLI argument parser implemented for `backendkit remove feature <name> [--dry-run] [--yes] [--force-core] [--force]` with short options `-n` and `-y`.
- Handler wired in `tools/backendkit/cli.ts` calling `runFeatureRemoval` through `feature/removal-confirmation.ts`: non-interactive runs without `--yes` fail closed; declining or closing the prompt (EOF) aborts with a non-zero exit code and no changes.
- Package script `"remove:feature": "npm run backendkit -- remove feature"` added to `package.json`.
- `scripts/scaffold-smoke.ts` extended to complete end-to-end round trip: scaffold simple and clean features with queue, wire both into `app.module.ts`, verify lint/typecheck/deps, remove both with `--yes --force`, assert clean unwiring and absence of files, verify lint/typecheck/deps, and safely clean up in `finally`. The wiring step now asserts both anchor replacements took effect before running gates.
- Full documentation updated in `docs/engineering/backendkit-cli.md`.
- Verification passed: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npx jest tools/backendkit` (36 suites / 205 tests), `npm run scaffold:smoke`, `npm run verify` (`fast` profile). `npm run verify:ci-local` completed all static, test, and gate checks, with existing upstream package audit advisories noted.

## Follow-Ups

- [ ] Move `_WIP/feature-lifecycle-cli-proposal.md` to completed or record ADR if baseline policies are altered.
