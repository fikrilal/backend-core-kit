# Feature Removal Engine Remediation

**Plan version:** 2
**Task ID:** feature-removal-engine-remediation
**Status:** completed
**Owner:** Ahmad Fikrilal
**Risk:** high
**Authority:** implement and verify locally; no external mutation
**Allowed paths:** docs/exec-plans/completed/2026-10-03_feature-removal-engine-remediation.md, tools/backendkit/feature/module-unwiring.ts, tools/backendkit/feature/module-unwiring.spec.ts, tools/backendkit/feature/baseline-pruner.ts, tools/backendkit/feature/baseline-pruner.spec.ts, tools/backendkit/feature/feature-removal.ts, tools/backendkit/feature/feature-removal.spec.ts, tools/backendkit/feature/feature-scaffold.ts, tools/backendkit/feature/feature-scaffold.spec.ts
**Allowed actions:** edit, verify
**Maximum risk:** high
**Repair limit:** 2
**Task timeout:** 90m

Date: 2026-10-03  
Related issue/PR: `_WIP/feature-lifecycle-cli-proposal.md`

## Objective

Remediate review findings on Plan 2 (`feature-removal-engine`):

1. Fix sibling-prefix / substring collisions in module unwiring, path discovery, and baseline pruning by enforcing segment boundaries.
2. Implement depth-aware bracket scanning in module unwiring to support nested arrays (e.g. `inject: [OtherService]`).
3. Fail closed on git status errors in safety preflight instead of silently returning clean.
4. Protect uncommitted work inside feature directories (`libs/features/<name>`) and test files in preflight dirty check.
5. Prevent whitespace-only false positives when no symbols were unwired.
6. Remove unused dead functions (`unwireModuleFile`, `unwireFeatureFromApps`) and unused options.
7. Support digit-leading feature names (`123-feature`, `2fa`) in preflight validation to match scaffold capability.
8. Preserve native EOL (`\r\n` vs `\n`) when rewriting multiline imports.
9. Add unit tests covering all reproduced failure cases.

## Constraints

- Architecture constraints: Only `tools/backendkit/feature/` is modified; strict TypeScript strictness enforced without type assertions.
- Product/runtime constraints: Preflight safety gates must fail closed to protect uncommitted developer work.
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

1. Sibling feature imports (e.g. `billing-v2` when removing `billing`, `order-history` when removing `order`) are never unwired or deleted.
2. Nested decorator arrays (e.g. `providers: [{ provide, inject: [...] }, TargetModule]`) are unwired correctly without truncation.
3. Git failure during dirty check throws an error (fails closed).
4. Uncommitted modifications in `libs/features/<name>` abort removal unless `--force` is supplied.
5. Files with 3+ blank lines return `changed: false` when 0 symbols are unwired.
6. Feature names starting with numbers (e.g. `2fa`, `123-feature`) are accepted by preflight.
7. Multiline import rewrites preserve the source file's line ending (`\r\n` or `\n`).
8. Unit tests in `module-unwiring.spec.ts`, `baseline-pruner.spec.ts`, and `feature-removal.spec.ts` prove all fixes.
9. `npm run verify` passes cleanly.

## Implementation Checklist

- [x] Update `module-unwiring.ts` with segment-boundary path matching, depth-aware bracket scanning, EOL preservation, and no-op blank line handling. Remove dead functions.
- [x] Update `baseline-pruner.ts` with strict segment boundary matching.
- [x] Update `feature-removal.ts` with digit-leading regex, fail-closed git status check, and full dirty checks covering `deletedPaths`.
- [x] Update unit tests across `module-unwiring.spec.ts`, `baseline-pruner.spec.ts`, and `feature-removal.spec.ts`.
- [x] Run full verification suite (`npm test`, `npm run verify`).

## Decision Log

- 2026-10-03: Elevate risk to `high` due to core harness engine modification under `tools/backendkit/feature/`.
- 2026-10-03: Require fail-closed safety preflight on git status checks to avoid silent data loss.

## Verification

```bash
# Feature engine unit tests: PASSED (4 suites, 47 tests)
npx jest tools/backendkit/feature

# All backendkit tests: PASSED (35 suites, 194 tests)
npx jest tools/backendkit

# Standard verification fast profile: PASSED
npm run verify

# Repo integrity checks: PASSED
npm run verify:knowledge
npm run verify:project-map
npm run verify:prisma
```

## Runtime Evidence

Not required for pure unit-tested harness engine modules.

## Risks And Mitigations

- Risk: Strict path boundaries could fail to match valid feature test layouts.
- Mitigation: Explicitly match directory, dot, or end-of-path boundaries (`/`, `.`, `$`).

## Completion Notes

Remediated all Plan 2 review findings:

1. Enforced strict segment/dot boundaries across module unwiring (`libs/features/${kebab}/`), path discovery (dot-separated `.e2e-spec.ts`, `.int-spec.ts`, `.worker.ts`, or exact folder), and baseline pruning (`matchesFeaturePath`) so sibling features (`billing-v2`, `order-history`) are never targeted.
2. Implemented depth-aware bracket scanning in module unwiring with toggle-based quote escape handling; eliminated stale `lastIndex` regex state using non-global sequential regex matching, verified against real `worker.module.ts`.
3. Made `defaultGitStatusChecker` fail closed by throwing on git errors, attaching caught error causes.
4. Expanded dirty preflight to guard both `modifiedPaths` and `deletedPaths` against uncommitted data loss.
5. Prevented whitespace false positives by guarding blank line cleanup behind unwired symbol checks.
6. Removed unused dead functions `unwireModuleFile` and `unwireFeatureFromApps` and the unused `yes` option.
7. Enforced letter-starting kebab-case names (`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`) across both scaffold and removal to ensure valid TypeScript identifier generation.
8. Preserved native EOL line endings (`\r\n` vs `\n`) during multiline import rewrites.
9. Resolved worker under-matching by detecting hyphenated worker jobs (`users-account-deletion.worker.ts`) that import from the target feature (`libs/features/${kebab}/`), while keeping shared workers (`emails.worker.ts`) and sibling workers untouched.
10. Added comprehensive unit tests covering all failure modes and verified all suites pass cleanly.

## Follow-Ups

- [ ] Proceed to Plan 3 (`feature-lifecycle-integration`).
