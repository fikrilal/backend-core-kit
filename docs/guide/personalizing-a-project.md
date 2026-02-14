# Personalizing a New Project

Use this guide when turning the core kit into a concrete product backend.

This is not about adding random features. It is about making explicit, documented decisions per project while keeping the shared standards and gates intact.

## Outcome

By the end, you should have:

- project identity and runtime profile set
- feature surface scoped for the product
- environment and secrets configured for each stage
- API contract and error-code ownership established
- CI/CD and operational gates tailored but still strict
- a short project profile doc that records decisions

## 1) Set Service Identity

Update baseline identity first:

- `package.json` name/description/version
- `OTEL_SERVICE_NAME` (must be project-specific)
- public product URLs and domain names in env

Keep this aligned in:

- `README.md`
- `env.example`
- deployment manifests/pipeline vars

## 2) Define Product Scope (Now, Not Later)

Decide what this product will use from the starter:

- auth methods: password, OIDC, or both
- background jobs required vs not used yet
- admin/RBAC surfaces required at launch
- storage integrations required at launch (S3-compatible, email provider, push provider)

For anything intentionally not used, set it to an explicit "off" state in config instead of leaving ambiguous placeholders.

## 3) Confirm Non-Negotiables Stay Intact

These must survive personalization:

- strict TypeScript + no `any`
- feature/layer boundaries (`deps:check`)
- response envelope + RFC7807 error shape
- OpenAPI snapshot + Spectral lint gates
- separate API and worker processes

If a project needs to deviate, add an ADR first.

## 4) Create a Project Profile Document

Create `docs/core/project-profile.md` in the project and keep it short.

Recommended sections:

- Product context
- Launch scope
- Enabled integrations
- Auth/session strategy
- Data retention and deletion policy
- SLO/SLA targets
- Environments (dev/staging/prod) and differences
- Known intentional deviations from core kit defaults

This becomes the first place maintainers check before changing behavior.

## 5) Tailor Configuration and Secrets

Per environment (dev/staging/prod), define:

- required env vars
- secret sources (secret manager, mounted files, runtime env)
- forbidden local-only flags in production

Minimum production checks:

- `NODE_ENV=production`
- `HTTP_TRUST_PROXY` explicitly set
- DB/Redis TLS behavior explicitly set
- no secrets committed in git

## 6) Establish API Ownership Rules

Before adding product endpoints:

- define tag boundaries in OpenAPI by feature area
- define error code ownership per feature
- enforce `operationId` naming patterns

Any API change should include:

- OpenAPI artifact update (`docs/openapi/openapi.yaml`)
- `x-error-codes` updates
- e2e coverage for critical flows

## 7) Tailor CI/CD Without Weakening Gates

Keep the golden path and add project-specific jobs around it.

Required baseline:

- `npm run verify`
- `npm run verify:e2e`
- runtime dependency audit gate (`npm audit --omit=dev --audit-level=high`)

Typical project-specific additions:

- image build + scan
- deployment policy checks
- migration safety checks

## 8) Launch Readiness Checklist

Before first production deployment, confirm:

- [ ] `verify` passes on CI
- [ ] `verify:e2e` passes on CI
- [ ] OpenAPI snapshot committed and reviewed
- [ ] rollback-safe migration plan documented
- [ ] readiness/liveness checks wired in runtime platform
- [ ] logs/traces/metrics visible in target observability stack
- [ ] on-call runbook and incident contacts documented

## 9) Ongoing Personalization Discipline

As the product evolves:

- keep `project-profile.md` up to date
- add ADRs for architectural deviations
- update standards/docs in the same PR when behavior changes
- avoid one-off shortcuts that bypass shared contracts
