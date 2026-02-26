# Engineering Proposal: Automated Architecture Smell Scan

Date: 2026-02-26
Owner: Backend Platform
Status: Proposed

## Problem Statement

Architecture and maintainability issues are currently detected via manual review. That works for deep audits, but it is slow, inconsistent, and hard to run continuously. Repeated issues (duplication, boundary drift, untyped error codes, and growing orchestration complexity) can slip through day-to-day PRs.

## Goals

1. Detect high-signal architecture/code-quality smells automatically in under 60 seconds.
2. Provide actionable output with file/line references.
3. Prevent regressions without blocking delivery on legacy debt.
4. Integrate with existing repo workflow (`npm run verify`) incrementally.

## Non-Goals

1. Replace typecheck/lint/dependency-cruiser/OpenAPI gates.
2. Enforce subjective style preferences.
3. Build a full AST-heavy static analyzer in v1.

## Proposal Summary

Add a new script:

- `scripts/architecture-smells.ts`

Add new npm commands:

- `npm run smells:arch` (local report; non-blocking)
- `npm run smells:arch:ci` (CI mode; fails on configured severity/delta)

Add baseline file:

- `tools/architecture-smells.baseline.json`

Add report artifact output:

- `_WIP/architecture-smells.md`

## Detection Rules (v1)

Each finding includes: `id`, `severity`, `message`, `file`, `line`, `snippet?`, `docsLink?`.

### High Severity

1. `boundary_app_imports_platform_impl`

- Feature `app` layer imports concrete platform services/adapters (except approved ports/types).

2. `raw_error_code_literal`

- Raw string code values in non-test source (e.g. `code: 'SOME_CODE'`) outside approved enum definitions.

3. `duplicate_tx_retry_classifier`

- Reimplementation of retryable transaction classifier instead of shared utility.

### Medium Severity

1. `duplicate_cursor_where_builder`

- Repeated cursor/equality/compare/after-where implementations across repositories.

2. `repeated_request_trace_fallback`

- Repeated `req.requestId ?? 'unknown'` and similar per-controller request metadata fallback patterns.

3. `repeated_best_effort_job_try_catch`

- Repeated best-effort enqueue/schedule try-catch logging blocks in controllers.

4. `oversized_orchestration_file`

- Non-test service/repository/worker files over threshold (default 350 LOC).

### Low Severity

1. `repeated_local_string_normalizer`

- Duplicate local helpers like `asNonEmptyString` where shared utility exists.

## Implementation Design

## Runtime Model

- Implement in TypeScript (`ts-node --files`), same as existing scripts.
- Use fast shell-backed search (`rg`) for pattern discovery.
- Use minimal parsing/normalization in script for dedupe and false-positive filtering.
- Keep rule definitions data-driven for easy extension.

## Output Model

1. Console summary:

- Total findings by severity
- New vs baseline counts
- Top repeated rule IDs

2. Markdown report:

- Write `_WIP/architecture-smells.md`
- Group by severity then rule
- Include exact file:line entries

3. JSON output (optional flag):

- `--json <path>` for CI artifact/analytics

## Baseline + Delta Strategy

Use baseline to avoid “big bang” blocking:

1. First run generates `tools/architecture-smells.baseline.json`.
2. CI mode compares current findings against baseline keys (`id + file + line + normalized_message`).
3. `smells:arch:ci` fails only when:

- New High findings appear, or
- Total High findings exceed baseline (configurable), or
- `--strict` is enabled.

## CLI Options

- `--ci`
- `--report <path>` (default `_WIP/architecture-smells.md`)
- `--baseline <path>` (default `tools/architecture-smells.baseline.json`)
- `--update-baseline`
- `--max-loc <n>`
- `--fail-on <high|medium|low>`
- `--json <path>`

## npm + CI Integration

In `package.json`:

- `"smells:arch": "ts-node --files scripts/architecture-smells.ts --report _WIP/architecture-smells.md"`
- `"smells:arch:ci": "ts-node --files scripts/architecture-smells.ts --ci --baseline tools/architecture-smells.baseline.json"`

Rollout path:

1. Phase 1: Add `smells:arch` local only.
2. Phase 2: Add `smells:arch:ci` in non-blocking CI job (informational).
3. Phase 3: Enforce fail on new High findings.
4. Phase 4: Optionally include in `npm run verify`.

## Rollout Plan

## Phase 1 (Week 1)

1. Build v1 scanner with 5-7 high-value rules.
2. Generate first baseline.
3. Publish report format and triage process.

## Phase 2 (Week 2)

1. Add CI informational job + artifact upload.
2. Tune false positives with suppression list.

## Phase 3 (Week 3)

1. Turn on blocking for new High findings.
2. Create ownership rotation for baseline updates.

## Governance

## Ownership

- Primary owner: Platform team
- Reviewers: Feature maintainers for rule additions

## Rule Lifecycle

1. Propose rule in PR with examples.
2. Add tests for true-positive and false-positive cases.
3. Land as warning first, then enforce.

## Suppression Policy

Allowed only with explicit comment in suppression file:

- `tools/architecture-smells.suppressions.json`
- Must include `reason`, `owner`, and `expiry_date`.

## Risks and Mitigations

1. False positives create noise.

- Mitigation: baseline/delta rollout + suppression with expiry + rule tests.

2. Overlap with existing gates.

- Mitigation: keep smell scanner focused on heuristics not covered by lint/depcruise.

3. Performance concerns.

- Mitigation: `rg`-first implementation and narrow globs (`apps`, `libs`, `scripts`).

## Success Metrics

1. Scanner runtime < 60s on dev machine.
2. New High smell leakage in PRs reduced to near zero.
3. Time for architecture review reduced (target: >40% faster for standard feature PRs).
4. Downward trend in duplicated-rule findings over 4-8 weeks.

## Acceptance Criteria

1. `npm run smells:arch` generates `_WIP/architecture-smells.md` successfully.
2. `npm run smells:arch:ci` fails on introduced High-severity smell not in baseline.
3. Baseline update flow is documented and reproducible.
4. At least one rule each for boundary drift, duplication, and error-code hygiene is validated by test fixtures.

## Example Report Snippet (Target)

```md
## High

### raw_error_code_literal (2)

- libs/features/auth/infra/http/me-push-token.controller.ts:25
  - Raw string error code literal `PUSH_NOT_CONFIGURED`
- libs/features/auth/infra/http/me-push-token.controller.ts:60
  - `ProblemException` uses raw code string
```

## Open Questions

1. Should `smells:arch:ci` be part of `verify` immediately, or after one sprint of observation?
2. Do we want CODEOWNERS approval required for baseline updates?
3. Should we publish trend metrics to CI summary for weekly tracking?

## Recommendation

Approve and implement in 3 phases, starting with non-blocking mode and baseline/delta enforcement. This gives immediate review acceleration with low adoption risk and aligns with current architecture standards and ADR discipline.
