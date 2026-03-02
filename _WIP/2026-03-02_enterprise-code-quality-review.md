# Enterprise Architecture + Code Structure Review

Date: 2026-03-02
Scope: `apps/*`, `libs/*`, `test/*`, `docs/*`, `AGENTS.md`, `.dependency-cruiser.cjs`, `eslint.config.mjs`, CI workflow(s), `package.json`
Review mode: Read-only analysis (no production code changes)

## 1) Executive Summary
Overall status: **Yellow**

Top 3 risks:
1. **Feature-boundary leakage is occurring and not fully guarded** (Auth feature imports Users feature app service directly).
2. **CI/CD governance gap for enterprise release flow** (PR-only workflow; no main-branch build/publish gate despite standards requiring it).
3. **Local reliability gate is not hermetic** (`verify:e2e` fails without pre-set DB env, reducing confidence in reproducible local validation).

Positive baseline signal:
- `npm run verify` passed end-to-end (format, lint, typecheck, dep boundaries, unit tests, OpenAPI check/lint).
- `npm run deps:check` reported zero boundary violations.

## 2) Prioritized Findings

### High

#### Title
Cross-feature coupling is present and not prevented by boundary rules

Evidence:
- `.dependency-cruiser.cjs:33` to `.dependency-cruiser.cjs:37` (rules stop `features -> apps`, but no `feature -> other feature` guard).
- `libs/features/auth/infra/auth.module.ts:9` (`AuthModule` imports `UsersModule`).
- `libs/features/auth/infra/http/auth.controller.ts:28` (`AuthController` imports `UsersService` from `users/app`).
- `libs/features/auth/infra/http/auth.controller.ts:50` to `libs/features/auth/infra/http/auth.controller.ts:53` (controller injects both Auth and Users services).
- `libs/features/auth/infra/http/auth.controller.ts:97`, `:132`, `:316` (Auth endpoints call `users.getMe(...)`).

Why it matters:
- Creates tight feature coupling and reduces independent evolvability/extractability.
- Increases blast radius for auth or users changes.
- Bypasses intended vertical-slice ownership and weakens long-term modularity.

Principle(s):
- Boundary integrity, SOLID (DIP/SRP), Maintainability, Scalability

Recommended fix:
- Introduce an auth-owned read port (for "me" projection) and adapt it via infra composition, or move response assembly to API composition layer.
- Add dependency-cruiser rule to block cross-feature imports by default, with explicit allowlist exceptions.

---

#### Title
Enterprise CI/CD baseline is incomplete for main/release lifecycle

Evidence:
- `.github/workflows/ci.yml:3` to `.github/workflows/ci.yml:5` (triggered only on `pull_request`).
- `docs/standards/ci-cd.md:50` to `docs/standards/ci-cd.md:54` (baseline expects main-merge build/publish immutable artifacts).

Why it matters:
- Protects PRs, but does not enforce post-merge artifact integrity/reproducibility in-repo.
- If direct pushes/automation bypass PR context, branch-level confidence drops.
- Release correctness and provenance controls are incomplete.

Principle(s):
- Reliability, Security, Scalability, Change safety

Recommended fix:
- Add a `push` workflow for protected branches (`main`) with build + artifact publication checks (or at minimum build + smoke + attestability step).
- Keep existing PR checks unchanged; add release pipeline incrementally.

### Medium

#### Title
Security standard requires secret scanning, but CI workflow does not explicitly enforce it

Evidence:
- `docs/standards/security.md:80` to `docs/standards/security.md:83` (secret scanning expected baseline).
- `docs/standards/ci-cd.md:32` to `docs/standards/ci-cd.md:35` (security gates include secret scanning).
- `.github/workflows/ci.yml:23` to `.github/workflows/ci.yml:40` (dependency review + runtime audit present; no explicit secret-scan step).

Why it matters:
- Increases risk of credential/token leakage reaching default branch unnoticed by workflow-level checks.

Principle(s):
- Security posture, Reliability

Recommended fix:
- Add PR gate for secret scanning (e.g., gitleaks/trufflehog or organization-native secret scanning check surfaced as required status).

---

#### Title
`verify:e2e` local golden-path is not self-contained and failed in clean execution

Evidence:
- `scripts/verify-e2e.ts:137` to `scripts/verify-e2e.ts:144` (sets default storage env only).
- `scripts/verify-e2e.ts:165` (runs `prisma:migrate:deploy` without injecting `DATABASE_URL`).
- `prisma.config.ts:46` (Prisma requires `env('DATABASE_URL')`).
- Runtime observation: `npm run verify:e2e` failed with `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`.

Why it matters:
- "Golden path" reliability is reduced for clean environments/onboarding.
- Increases false negatives in local validation and slows delivery.

Principle(s):
- Reliability, DX/change velocity, Testability

Recommended fix:
- In `verify-e2e.ts`, set deterministic defaults for `DATABASE_URL` and `REDIS_URL` (aligned with CI/docker compose) or perform explicit preflight with actionable failure before spinning dependencies.

---

#### Title
RBAC guard is fail-open when required permissions metadata is missing

Evidence:
- `libs/platform/rbac/rbac.guard.ts:35` to `libs/platform/rbac/rbac.guard.ts:37` (`required.length === 0` returns `true`).

Why it matters:
- A missed `@RequirePermissions(...)` can silently grant broader access than intended.
- Security depends on decorator discipline alone.

Principle(s):
- Security, Reliability, Defense in depth

Recommended fix:
- Add stricter policy for sensitive route spaces (e.g., `/admin`) to require explicit permissions metadata.
- Add static guardrail (lint/custom check) that admin controllers/handlers must declare permissions.

---

#### Title
Coverage is collected but not quality-gated

Evidence:
- `jest.config.cjs:17` to `jest.config.cjs:18` (coverage collection configured).
- `jest.config.cjs` has no `coverageThreshold`.
- `.github/workflows/ci.yml` has no coverage threshold enforcement step.

Why it matters:
- High test count does not guarantee stable critical-path coverage over time.
- Regressions can pass CI if they avoid current assertion surfaces.

Principle(s):
- Testability, Reliability, Maintainability

Recommended fix:
- Add minimal threshold first on critical modules (e.g., auth/security/platform) and ratchet gradually.

### Low

#### Title
Bootstrap logic is duplicated between API and worker entrypoints

Evidence:
- `apps/api/src/main.ts:1` to `apps/api/src/main.ts:45`
- `apps/worker/src/main.ts:1` to `apps/worker/src/main.ts:38`

Why it matters:
- Increases drift risk for shutdown/telemetry/env boot behavior.

Principle(s):
- DRY, Maintainability

Recommended fix:
- Extract common startup harness in `libs/platform` for env load + telemetry lifecycle + listen host/port policy.

---

#### Title
Architecture docs have minor path drift for observability folder naming

Evidence:
- `docs/core/project-architecture.md:42` references `libs/platform/observability/`.
- Actual implementation is `libs/platform/otel/*` (for example `libs/platform/otel/telemetry.ts:1`).

Why it matters:
- Small but recurring onboarding friction and searchability mismatch.

Principle(s):
- Readability, Maintainability

Recommended fix:
- Update docs to `libs/platform/otel/` (or add explicit mapping note).

## 3) Phased Remediation Plan

### Phase 1: Guardrail hardening (small, high leverage)
- Add dependency-cruiser rule for cross-feature imports (default deny + explicit allowlist).
- Add CI secret-scan gate.
- Add admin-permission metadata static check.
Risk/effort: **Low risk / Low-medium effort**

### Phase 2: Decouple auth/users feature boundary
- Introduce auth-owned read port for user projection or compose user-enrichment at API module boundary.
- Remove direct `auth -> users/app` imports.
Risk/effort: **Medium risk / Medium effort** (API surface unchanged if done via adapter)

### Phase 3: CI/CD lifecycle completion
- Add main-branch workflow with build artifact step (and publish if desired).
- Keep PR checks as-is; ensure parity with standards doc.
Risk/effort: **Low risk / Medium effort**

### Phase 4: Reliability and confidence upgrades
- Make `verify:e2e` hermetic via explicit env defaults/preflight.
- Add coverage thresholds starting with critical modules and ratchet policy.
Risk/effort: **Low risk / Low-medium effort**

### Phase 5: Cleanup + consistency
- Extract shared API/worker bootstrap helper.
- Fix docs path drift.
Risk/effort: **Low risk / Low effort**

Suggested execution order: **Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5**

## 4) Major-Area Status

### Architecture boundaries
- Done:
  - Automated boundary/cycle gate exists and currently passes (`.dependency-cruiser.cjs`, `npm run deps:check`).
- Not done:
  - No explicit rule for feature-to-feature dependency restrictions.
- Remaining risk:
  - Cross-feature coupling can increase without CI failure.

### Feature modularity/composability
- Done:
  - Vertical-slice structure is present across features (`app`/`infra`; `auth` also has `domain`).
- Not done:
  - Auth feature currently depends on Users feature service/module directly.
- Remaining risk:
  - Harder extraction/reuse and larger blast radius for changes.

### Reliability posture
- Done:
  - `npm run verify` passed all configured gates.
  - Timeout/retry/readiness patterns are implemented in platform modules.
- Not done:
  - `verify:e2e` reproducibility is fragile without external env setup.
- Remaining risk:
  - Local/CI parity gaps and onboarding friction.

### Security posture
- Done:
  - Strong token/key/env invariants and log redaction are implemented.
  - Runtime dependency audit and dependency review are in CI.
- Not done:
  - No explicit secret-scanning CI gate in workflow.
  - RBAC guard allows requests when permissions metadata is absent.
- Remaining risk:
  - Configuration/decorator mistakes can degrade security posture.

### Test strategy and coverage confidence
- Done:
  - Layered strategy exists (unit/int/e2e + contract gates); CI runs all tiers.
  - 51 unit suites passed in this review run.
- Not done:
  - Coverage thresholds are not enforced.
- Remaining risk:
  - Coverage on critical paths can regress silently.

### Developer experience / change velocity
- Done:
  - Scripted golden paths and architecture gates are strong.
- Not done:
  - `verify:e2e` ergonomics and minor docs drift reduce predictability.
- Remaining risk:
  - Slower onboarding and higher chance of local validation churn.

## 5) Core/Shared Module Improvements

To make future modules/endpoints mostly assembly work:

1. Extract a cross-feature read-model seam:
- Create an explicit shared read port contract (or API composition adapter pattern) so features do not import each other’s app services.

2. Standardize process bootstrap composition:
- Build `libs/platform/bootstrap` helper used by both API and worker (dotenv, telemetry lifecycle, host/port resolution, shutdown hooks).

3. Standardize authorization safety checks:
- Automate route metadata validation for admin/sensitive controllers (`@UseGuards(AccessTokenGuard, RbacGuard)` + `@RequirePermissions`).

4. Expand automated boundary rules:
- Add depcruise rules for:
  - feature-to-feature imports (deny by default)
  - optional explicit exception list in config for intentional seams.

5. Make local deps-backed verification deterministic:
- Enhance `verify:e2e` preflight/default env handling for DB/Redis.
- Keep behavior aligned with CI env model.

6. Add measurable coverage guardrails:
- Start with modest module-specific thresholds in CI and ratchet over time.

7. Keep docs/code alignment automated:
- Add a lightweight docs-lint/check for known architecture path terms to prevent drift.
