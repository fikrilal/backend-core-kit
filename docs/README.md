# Backend Core Kit — Documentation

This repository is a production-grade backend boilerplate (“core kit”) with opinionated defaults intended to be reused across many future services.

The docs are the source of truth for architecture, standards, and workflows. Code should follow these docs; if code and docs diverge, fix the mismatch.

## Navigation

- Core
  - `docs/core/project-overview.md`
  - `docs/core/project-stack.md`
  - `docs/core/project-architecture.md`
- Standards (normative)
  - `docs/standards/api-response-standard.md`
  - `docs/standards/security.md`
  - `docs/standards/code-quality.md`
  - `docs/standards/error-codes.md`
  - `docs/standards/pagination-filtering-sorting.md`
  - `docs/standards/authentication.md`
  - `docs/standards/authorization-rbac.md`
  - `docs/standards/configuration.md`
  - `docs/standards/database.md`
  - `docs/standards/queues-jobs.md`
  - `docs/standards/observability.md`
  - `docs/standards/reliability.md`
  - `docs/standards/testing-strategy.md`
  - `docs/standards/ci-cd.md`
- Guides (how-to)
  - `docs/guide/personalizing-a-project.md`
  - `docs/guide/getting-started.md`
  - `docs/guide/development-workflow.md`
  - `docs/guide/adding-a-feature.md`
  - `docs/guide/adding-an-endpoint.md`
  - `docs/guide/adding-a-job.md`
- Engineering (implementation notes)
  - `docs/engineering/README.md`
- ADRs (decision log)
  - `docs/adr/README.md`
  - `docs/adr/template.md`
- OpenAPI (generated)
  - `docs/openapi/README.md`

## Doc Conventions

- “**Standards**” are normative. If you want to deviate, add an ADR and document the exception.
- Prefer small, composable standards. Avoid “one-off” patterns that don’t scale to multiple projects.
- Keep docs implementation-aware (file paths, config keys, behaviors), but not code-dump heavy.
