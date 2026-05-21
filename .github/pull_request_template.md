## Summary

Describe what changed and why.

- What changed:
- Why:

## Phase Task IDs Covered

- Example: `P1-2`, `P2-1`, `P3-4`
- `N/A` for standalone work

## Risk Class

- [ ] `low`
- [ ] `medium`
- [ ] `high`

Risk notes:

- Production impact areas touched:
- Why this risk class was selected:
- Reviewer attention required? (`yes/no`)

Impact areas:

- [ ] API/OpenAPI
- [ ] DB/Prisma/migrations
- [ ] Auth/session/RBAC
- [ ] Queue/jobs
- [ ] Env/config/secrets
- [ ] Observability/logging/tracing
- [ ] External integrations
- [ ] CI/release/harness

## Acceptance Criteria

1.
2.
3.

## Architecture Smell / Harness Impact

- New findings:
- Reduced findings:
- Unchanged findings:
- Smell trend by phase:
- Duplication report impact:
- Gate/baseline/allowlist changes:

## OpenAPI / Error Code Impact

- OpenAPI snapshot changed? (`yes/no`)
- API contract diff summary:
- Spectral impact:
- Error code additions/changes:
- Error response/problem-detail impact:

## DB / Prisma / Migration Impact

- Prisma schema changed? (`yes/no`)
- Migration added? (`yes/no`)
- Prisma Client regenerated? (`yes/no/N/A`)
- Migration verification command/outcome:

## Runtime Evidence

- Integration/e2e evidence:
- API request/response evidence:
- Queue/job evidence:
- Logs/traces/correlation IDs:
- Config/env evidence:
- Artifact links/paths:

Do not include secrets, tokens, private keys, service-account JSON, or raw PII.

## Verification

List exact commands and outcomes, including failures and known blockers.

```bash
# examples:
# npm run verify
# npm run verify:ci-local
# npm run smells:arch:ci
# npm run openapi:check
# npm run openapi:lint
# npm run duplication:report
# npm run verify:e2e
```

Commands run:

- `...` -> outcome:

Checks not run:

- `...` -> reason:

## Evidence Checklist

- [ ] Tests added/updated where behavior changed
- [ ] OpenAPI snapshot generated/checked when HTTP surface changed
- [ ] Prisma Client regenerated when Prisma schema changed
- [ ] Migration/integration/e2e evidence attached when DB/Redis/queue/storage behavior changed
- [ ] Logs/traces attached for runtime-sensitive changes
- [ ] Duplication report reviewed when shared logic or helpers changed
- [ ] No speculative refactor mixed into this PR

## Risk / Rollback

- Risk areas:
- Potential failure mode:
- Rollback strategy:
- Follow-up required after merge:

## Reviewer Focus

Point reviewers to the highest-risk files, decisions, and tradeoffs:

-
