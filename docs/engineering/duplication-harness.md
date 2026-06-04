# Duplication Harness

The duplication harness makes backend copy/paste debt visible during self-review.
It complements `scripts/architecture-smells.ts`; it does not replace that curated
smell scanner.

## Commands

- `npm run duplication:core`
- `npm run duplication:small-helpers`
- `npm run duplication:report`

`npm run duplication:report` runs both profiles, writes markdown summaries under
`_WIP/`, and currently exits successfully even when actionable duplicate groups
exist. This is intentional for the first tuning phase.

## Profiles

### Core profile

Config: `.jscpd.json`

Report: `_WIP/duplication-report.md`

Purpose:

- medium-sized backend clone detection
- repository/query builder repetition
- mapper and error mapping repetition
- queue/idempotency helper repetition

### Small-helper profile

Config: `.jscpd.small-helpers.json`

Report: `_WIP/small-helper-duplication-report.md`

Purpose:

- short helper repetition that agents commonly create
- parser, formatter, normalization, and mapper helpers
- smaller token threshold than the core profile

## Scan Scope

Both profiles scan:

- `libs/features`
- `libs/platform`
- `libs/shared`
- `apps/worker/src/jobs`

Both profiles initially ignore:

- tests (`*.spec.ts`, `*.test.ts`, `test/**`)
- generated output
- migrations
- OpenAPI snapshots
- build/cache output

## Categories

The filter categorizes backend-specific duplicate groups:

- error/problem mapping
- Prisma query builders
- cursor/filter/sort helpers
- rate limiter helpers
- transaction retry helpers
- queue job envelope/idempotency helpers
- request trace fallback helpers
- date/time parsing and normalization helpers
- DTO-to-view mappers

Uncategorized duplicates are filtered out of the actionable list to avoid
treating raw token similarity as a CI signal.

## Allowlists

Allowlists live in:

- `tools/duplication-allowlist.json`
- `tools/small-helper-duplication-allowlist.json`

Use an allowlist only after reviewing the duplicate group. Each entry must name
the category, the two files, and a rationale.

Example:

```json
{
  "category": "dto_view_mapper",
  "files": [
    "libs/features/auth/infra/http/dtos/auth.dto.ts",
    "libs/features/users/infra/http/dtos/me.dto.ts"
  ],
  "reason": "Parallel DTO metadata is clearer than an abstraction here.",
  "reviewedOn": "2026-06-04"
}
```

## Review Guidance

Actionable means the duplicate group matched a category the backend cares about
and has not been reviewed as acceptable. It does not automatically mean extract
the code immediately.

Prefer refactoring when the duplicated code is shared policy or behavior:

- query construction
- retry classification
- request/trace fallback logic
- job envelope/idempotency behavior
- DTO/view mapping that will drift across features

Prefer allowlisting when the duplication is intentional parallel structure and
the abstraction would hide feature-specific meaning.

## CI Posture

The first adoption phase is a report gate:

- the raw jscpd commands must run
- the filter and allowlists must parse
- reports must be generated
- actionable findings remain visible but non-fatal

After tuning, selected categories can be made fatal by passing
`--fatal-found` to `scripts/filter-duplication-report.ts`.
