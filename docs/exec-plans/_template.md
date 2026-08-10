# <Plan Title>

**Plan version:** 2
**Task ID:** lowercase-kebab-case-task-id
**Status:** active
**Owner:** <name>
**Risk:** low | medium | high
**Authority:** implement and verify locally; no external mutation
**Allowed paths:** narrow/repository-relative/file-or-directory-prefixes
**Allowed actions:** edit, verify
**Maximum risk:** low | medium | high
**Repair limit:** 2
**Task timeout:** 90m

Date: YYYY-MM-DD  
Related issue/PR: <link or N/A>

## Objective

Describe the concrete outcome this task must deliver.

## Constraints

- Architecture constraints:
- Product/runtime constraints:
- Out of scope:

## Impact Areas

- API/OpenAPI: yes | no
- DB/Prisma/migrations: yes | no
- Auth/session/RBAC: yes | no
- Queue/jobs: yes | no
- Env/config/secrets: yes | no
- Observability/logging/tracing: yes | no
- External integrations: yes | no
- CI/release/harness: yes | no

## Acceptance Criteria

1.
2.
3.

## Implementation Checklist

- [ ] Step 1
- [ ] Step 2
- [ ] Step 3

## Decision Log

- YYYY-MM-DD: <decision> -> <reason>

## Verification

List exact commands and outcomes.

```bash
# example
npm run verify
```

Additional targeted checks when relevant:

```bash
# examples
# npm run verify:ci-local
# npm run verify:e2e
# npm run openapi:generate
# npm run openapi:check
# npm run duplication:report
```

## Runtime Evidence

Required when static checks do not sufficiently prove behavior.

- Environment:
- Dependencies/services:
- Executed request/job/flow:
- Artifact path(s):
- Relevant log/trace/request IDs:
- Notes:

## Risks And Mitigations

- Risk:
- Mitigation:

## Completion Notes

Summarize what shipped, what changed, and any important caveats.

## Follow-Ups

- [ ] Add unresolved debt to `docs/exec-plans/tech-debt-tracker.md`
