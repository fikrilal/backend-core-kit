# Guardrails

This document explains the mechanical guardrails that keep backend changes
consistent, reviewable, and production-safe.

Use this when deciding:

- what checks exist
- where a rule should be enforced
- when a repeated review comment should become automation

Use `docs/engineering/agent-pr-loop.md` for the delivery workflow.

## Principles

Guardrails should make the correct path the easiest path.

Prefer guardrails that are:

- deterministic
- cheap enough to run locally
- hard to misinterpret
- better than repeating the same review comment

Do not add a guardrail for a one-off preference. Add one when the same failure
mode is likely to recur, especially with agent-authored code.

## Canonical Commands

Fast local gate:

```bash
npm run verify
```

Non-Docker CI mirror:

```bash
npm run verify:ci-local
```

Docker-backed dependency lane:

```bash
npm run verify:e2e
```

Targeted guardrails:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run verify:env
npm run verify:project-map
npm run deps:check
npm run smells:arch:ci
npm run duplication:report
npm run openapi:check
npm run openapi:lint
npm run verify:gates
npm run audit:prod
```

## Where Guardrails Live

### TypeScript, lint, and formatting

- `tsconfig.json`
- `eslint.config.mjs`
- `.prettierrc`
- `package.json`

### Architecture boundaries

- `.dependency-cruiser.cjs`
- `docs/adr/0014-enforce-architecture-boundaries.md`

### Repo-specific smell policy

- `scripts/architecture-smells.ts`
- `tools/architecture-smells.baseline.json`
- `_WIP/architecture-smells.md`

### Duplication review

- `.jscpd.json`
- `.jscpd.small-helpers.json`
- `scripts/filter-duplication-report.ts`
- `tools/duplication-allowlist.json`
- `tools/small-helper-duplication-allowlist.json`
- `docs/engineering/duplication-harness.md`

### Contract and API gates

- `scripts/openapi-generate.ts`
- `scripts/openapi-check.ts`
- `.spectral.yaml`
- `docs/openapi/openapi.yaml`

### Config and security

- `scripts/verify-env-example.ts`
- `.github/workflows/governance.yml`
- `npm run audit:prod`

### Scaffolding and gate honesty

- `tools/scaffold-feature.ts`
- `scripts/scaffold-smoke.ts`
- `scripts/gates-honesty.ts`

## What The Guardrails Enforce

### Architecture boundaries

Examples:

- feature app/domain layers stay framework-free
- platform does not import features
- forbidden imports and cycles fail the boundary gate

### API contract discipline

Examples:

- success envelope and problem details shape
- committed OpenAPI snapshot freshness
- Spectral contract linting
- `@ApiErrorCodes` metadata for route error codes

### Error and status policy

Examples:

- no raw error-code literals
- no raw numeric `@HttpCode(...)`
- no native Nest HTTP exceptions where `ProblemException` or feature errors
  should be used

### Time handling

Examples:

- app services use `Clock`
- worker wall-clock reads are reported for review when they affect persistence,
  retries, idempotency, or externally visible behavior

### Dependency and environment safety

Examples:

- `env.example` matches runtime config schema
- production dependency audit is explicit
- secret scanning runs in governance CI

### Duplication visibility

Examples:

- categorized duplication reports for backend helpers, mappers, query builders,
  error mapping, and queues
- reviewed acceptable duplicates are allowlisted with rationale

## When To Add A New Guardrail

Add a guardrail when:

- the same bug or review comment appears at least twice
- the rule is objective enough to automate
- automation is cheaper than future human review effort
- the failure mode affects auth, persistence, queues, API contracts, security, or
  production operations

Choose the lightest mechanism that works:

1. docs or scaffold template
2. ESLint/dependency-cruiser/config rule
3. architecture smell detector
4. standalone verify script
5. CI workflow gate

## Extending Guardrails

Use ESLint or dependency-cruiser when the rule is local and structural.

Use `scripts/architecture-smells.ts` when the rule is repo-specific, string/AST
detectable, and should produce remediation guidance.

Use a standalone `scripts/verify-*.ts` when the rule needs repository-wide
state, generated output, or multiple files.

Update docs with every guardrail change. If the guardrail changes a baseline
architecture or contract decision, add or update an ADR.

## Suppressions And Baselines

Prefer fixing existing violations before making a rule fatal.

Use baselines only when:

- the finding is real but cannot be fixed in the current change
- the debt is documented with owner and rationale
- new findings still fail at the selected severity

Do not baseline secrets, auth bypasses, contract breakage, or data-loss risks.

## Related Docs

- `docs/engineering/agent-pr-loop.md`
- `docs/engineering/parallel-agent-workflow.md`
- `docs/engineering/duplication-harness.md`
- `docs/exec-plans/README.md`
