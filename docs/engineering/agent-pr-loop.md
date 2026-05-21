# Agent PR Loop

This document defines the default delivery loop for agent-authored backend
changes.

Goals:

- keep changes predictable
- keep review cost low
- make production risk explicit
- preserve API/auth/data safety while moving quickly

## Scope

Use this loop for any change authored primarily by an AI coding agent.

For non-trivial work, create an execution plan first:

- `docs/exec-plans/README.md`
- `docs/exec-plans/active/`

## Sources Of Truth

Use these documents together:

- operating contract: `AGENTS.md`
- architecture: `docs/core/project-architecture.md`
- standards: `docs/standards/README.md`
- mechanical guardrails: `docs/engineering/guardrails.md`
- duplication review: `docs/engineering/duplication-harness.md`
- parallel-agent coordination: `docs/engineering/parallel-agent-workflow.md`
- OpenAPI contract: `docs/openapi/README.md`

## Loop Contract

### 1. Task Intake

Before implementation starts:

- write the task in one concrete sentence
- define acceptance criteria
- classify risk
- identify impact areas
- create a plan file for non-trivial work

Risk classes:

- `low`: docs, tests, narrow refactors, local harness work with no runtime/API
  behavior change
- `medium`: feature behavior, API response fields, mappers, queues, persistence
  queries, config, or non-breaking contract changes
- `high`: auth/session/RBAC, security, migrations, data deletion, token handling,
  idempotency, payment/billing, CI/release/infra, or breaking API behavior

Impact areas:

- API/OpenAPI
- DB/Prisma/migrations
- auth/session/RBAC
- queue/jobs
- env/config/secrets
- observability/logging/tracing
- external integrations
- CI/release/harness

### 2. Acceptance Criteria

Acceptance criteria must be observable.

Good examples:

- `POST /auth/refresh` preserves the response envelope and OpenAPI snapshot.
- failed login still returns the documented problem code.
- migration applies with `npm run verify:e2e`.
- worker retry behavior is covered by a unit or integration test.

Weak examples:

- make auth better
- clean up the repository
- improve reliability

### 3. Implement

During implementation:

- keep changes small and reversible
- follow the existing architecture boundaries
- avoid speculative refactors mixed into the requested change
- prefer explicit behavior over hidden coupling
- update docs when behavior, standards, or harness expectations change
- add or update ADRs when baseline decisions change

### 4. Mechanical Verification

Default local gate:

```bash
npm run verify
```

Use the non-Docker CI mirror when touching harness, CI-like gates, or shared
behavior:

```bash
npm run verify:ci-local
```

Run the Docker-backed lane when Prisma schema, migrations, Postgres, Redis,
MinIO, integration tests, or request flows touching real dependencies changed:

```bash
npm run verify:e2e
```

Targeted checks:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run deps:check
npm test
npm run openapi:check
npm run openapi:lint
npm run smells:arch:ci
npm run duplication:report
```

Run `npm run duplication:report` when the change adds or reshapes shared logic,
including mappers, query builders, retry classifiers, queue helpers, validators,
or repeated workflow tails.

### 5. Runtime Evidence

Static checks are not always enough. Add runtime evidence when behavior depends
on real services, network effects, queues, migrations, or deployment settings.

Runtime evidence is expected for:

- medium/high-risk auth, session, RBAC, or token changes
- request flows involving Postgres/Redis/MinIO
- queue/job behavior
- config/env behavior
- observability or external integration changes
- CI/release/deployment changes

Useful evidence:

- exact command and exit code
- API request/response snippets with sensitive values redacted
- OpenAPI diff summary
- migration output
- worker log lines with request/job IDs
- trace/log correlation IDs
- artifact paths for generated reports

Do not paste secrets, tokens, private keys, service-account JSON, or raw PII.

### 6. Self-Review

Before opening or updating a PR, verify:

- acceptance criteria are met
- risk class and impact areas are stated
- architecture boundaries are respected
- API envelope and problem details remain correct
- OpenAPI snapshot is current when HTTP surface changed
- Prisma Client is regenerated when schema changed
- migrations are included and verified when DB shape changed
- auth/session/RBAC behavior has targeted tests when touched
- queue/job behavior is idempotent and observable when touched
- env/config docs and examples are updated when config changed
- duplication report was run when shared logic or repeated helpers changed
- verification commands and outcomes are recorded truthfully

### 7. PR Description

Use `.github/pull_request_template.md`.

Include:

- risk class
- acceptance criteria
- API/OpenAPI impact
- DB/Prisma/migration impact
- auth/session/RBAC impact
- queue/job impact
- env/config impact
- verification commands and outcomes
- runtime evidence when static checks are insufficient
- known follow-ups or deferred debt
- reviewer focus areas

### 8. Review Iteration

For substantive follow-up changes:

- address comments in small deltas
- rerun targeted checks for the changed surface
- rerun the full gate if risk or behavior changed materially
- refresh runtime evidence when reviewed behavior changed

### 9. Merge Policy

- `low`: merge after required checks pass
- `medium`: human review strongly recommended
- `high`: human review required

## Failure To Harness Upgrade Rule

If the same class of failure appears twice, do not rely on repeated manual
review. Promote it into one of:

- lint rule
- architecture smell detector
- verify script
- scaffold/template update
- engineering doc update
- source-local README

## Definition Of Done

A PR is done only when:

1. acceptance criteria are met
2. required checks pass or known blockers are explicit
3. risk-class review expectations are satisfied
4. runtime evidence is present when behavior needs proof
5. follow-up debt is tracked instead of left implicit
