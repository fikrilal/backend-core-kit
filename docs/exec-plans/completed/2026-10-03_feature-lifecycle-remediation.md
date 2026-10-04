# Feature Lifecycle Plan 1 Remediation

**Plan version:** 2
**Task ID:** feature-lifecycle-remediation
**Status:** completed
**Owner:** Ahmad Fikrilal
**Risk:** high
**Authority:** implement and verify locally; no external mutation
**Allowed paths:** docs/exec-plans/completed/2026-10-03_feature-lifecycle-remediation.md, tools/scaffold-feature.ts, tools/backendkit/command.ts, tools/backendkit/command.spec.ts, tools/backendkit/feature/feature-scaffold.ts, tools/backendkit/feature/feature-scaffold.spec.ts, docs/engineering/backendkit-cli.md, docs/engineering/guardrails.md, docs/guide/adding-a-feature.md
**Allowed actions:** edit, verify
**Maximum risk:** high
**Repair limit:** 2
**Task timeout:** 90m

Date: 2026-10-03  
Related issue/PR: `_WIP/feature-lifecycle-cli-proposal.md`

## Objective

Remediate review findings on Plan 1: delete legacy standalone script `tools/scaffold-feature.ts` completely (zero legacy/fallback surface), restore dropped `handoff draft-pr` parser test, tighten CLI scaffold flag parsing (`-x`, missing `--tier` value, positional-override conflicts), eliminate dead ternary in `feature-scaffold.ts`, fix Windows path assertion portability in `feature-scaffold.spec.ts`, and update canonical documentation in `backendkit-cli.md`, `guardrails.md`, and `adding-a-feature.md`.

## Constraints

- Architecture constraints: Only `tools/backendkit/` and documentation are modified; no legacy fallback scripts remain.
- Product/runtime constraints: Strict TypeScript strictness and zero tolerance for dropped test coverage.
- Out of scope: User-facing CLI wiring for `remove feature` (deferred to Plan 3).

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

1. `tools/scaffold-feature.ts` is deleted completely; no legacy fallback script exists.
2. `tools/backendkit/command.spec.ts` restores the dropped `handoff draft-pr` parse assertions.
3. `tools/backendkit/command.ts` properly parses `--tier` (reports missing value if omitted), rejects unknown short flags (like `-x`), and rejects conflicting positional / `--name` arguments.
4. `tools/backendkit/feature/feature-scaffold.ts` eliminates the dead ternary for `tokenImport`.
5. `tools/backendkit/feature/feature-scaffold.spec.ts` uses cross-platform `path.join` for path assertions.
6. `docs/engineering/backendkit-cli.md`, `docs/engineering/guardrails.md`, and `docs/guide/adding-a-feature.md` accurately document `backendkit scaffold feature`.
7. `npm run verify` and `npm run scaffold:smoke` pass cleanly.

## Implementation Checklist

- [x] Delete `tools/scaffold-feature.ts`.
- [x] Fix `command.ts` scaffold argument parsing edge cases and add tests to `command.spec.ts` (including restoring `handoff draft-pr`).
- [x] Fix dead ternary in `tools/backendkit/feature/feature-scaffold.ts`.
- [x] Fix cross-platform path assertions in `tools/backendkit/feature/feature-scaffold.spec.ts`.
- [x] Update `docs/engineering/backendkit-cli.md`, `docs/engineering/guardrails.md`, and `docs/guide/adding-a-feature.md`.
- [x] Run full verification via `npm run verify` and `npm run scaffold:smoke`.

## Decision Log

- 2026-10-03: Eliminate legacy script `tools/scaffold-feature.ts` per engineering direction; repository-local CLI `backendkit scaffold feature` is the single source of truth.

## Verification

```bash
# Fast verification profile: PASSED (93 suites, 507 tests)
npm run verify

# End-to-end scaffolding smoke: PASSED (simple and clean features scaffolded, linted, typechecked, and cruised)
npm run scaffold:smoke

# Command unit tests: PASSED (8 tests, restored handoff draft-pr + scaffold edge cases)
npx jest tools/backendkit/command.spec.ts

# Feature scaffold unit tests: PASSED (8 tests, cross-platform assertions)
npx jest tools/backendkit/feature/feature-scaffold.spec.ts
```

## Runtime Evidence

Not required for CLI parsing and documentation remediation.

## Risks And Mitigations

- Risk: Removing `tools/scaffold-feature.ts` could break developers using direct ts-node invocations.
- Mitigation: `package.json` `"scaffold:feature"` script alias is already pointing to `npm run backendkit -- scaffold feature`.

## Completion Notes

Addressed all review findings: completely removed `tools/scaffold-feature.ts` (zero legacy duplicate parser surface), restored `handoff draft-pr` parser assertions and added tests for all argument validation edge cases in `command.spec.ts`, tightened flag validation in `command.ts`, cleaned up dead ternary in `feature-scaffold.ts`, ensured path assertion portability with `path.join`, and updated canonical documentation across `backendkit-cli.md`, `guardrails.md`, and `adding-a-feature.md`. Verified with `npm run verify` and `npm run scaffold:smoke`.

## Follow-Ups

- [ ] Proceed to Plan 3 (`feature-lifecycle-integration`).
