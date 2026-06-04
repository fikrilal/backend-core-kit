# Implementation Plan: Add Secret Scanning To Backend CI

Date: 2026-06-04
Status: Ready for implementation
Priority: P0
Target repo: `backend-core-kit`
Reference repo: `/home/fikrilal/devs/core/mobile-core-kit`

## Objective

Add an actual pre-merge secret scanning gate to `backend-core-kit` CI.

Backend docs already require secret scanning in `docs/standards/ci-cd.md`, but the current GitHub Actions workflow does not run a secret scanner. The implementation should close that docs-vs-harness gap with a deterministic CI job.

## Current State

Backend has one workflow:

- `.github/workflows/ci.yml`
- Trigger: `pull_request`
- Permissions: `contents: read`, `pull-requests: read`
- Existing checks include dependency review, `npm audit`, format, lint, typecheck, dependency boundaries, scaffold smoke, architecture smell scan, unit tests, OpenAPI gates, gate honesty, Docker deps, migrations, integration tests, and e2e tests.

Backend docs say security gates include:

- secret scanning (pre-merge)
- dependency scanning
- runtime dependency vulnerability audit

Mobile reference implementation:

- `/home/fikrilal/devs/core/mobile-core-kit/.github/workflows/governance.yml`
- Separate `Governance Checks` workflow
- Runs on:
  - `pull_request`
  - `push` to `main`
  - `workflow_dispatch`
- Has a `secret-scan` job using `gitleaks/gitleaks-action@v2`
- Uses checkout with `fetch-depth: 0`

## Recommended Shape

Add a separate backend workflow:

- `.github/workflows/governance.yml`

Do not add the secret scan as a step inside `.github/workflows/ci.yml` unless there is a strong preference to keep all checks in one workflow.

Rationale:

- Secret scanning is governance, not Node build/test execution.
- It should run independently and fail fast.
- It should also run on `push` to `main`, not only PRs.
- Keeping it separate avoids increasing the critical path of the Docker-backed CI job.
- This matches the more mature mobile harness.

## Proposed Workflow

Create `.github/workflows/governance.yml`:

```yaml
name: Governance Checks

on:
  pull_request:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

jobs:
  secret-scan:
    name: Secret Scan
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - name: Secret scan (gitleaks)
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Notes:

- Use `actions/checkout@v6` to match backend CI’s current checkout version.
- Use `fetch-depth: 0` so gitleaks can scan history/ranges correctly.
- Keep top-level permissions minimal.
- `pull-requests: read` should not be needed for the secret scan job.
- Do not add repo secrets or credentials for this. `GITHUB_TOKEN` is enough for the action.

## Implementation Steps

1. Inspect current workflow state.

   ```bash
   sed -n '1,180p' .github/workflows/ci.yml
   sed -n '1,90p' docs/standards/ci-cd.md
   ```

2. Create `.github/workflows/governance.yml` with the proposed workflow.

3. Keep `.github/workflows/ci.yml` unchanged unless the team wants dependency review moved into governance later.

4. Run a local YAML sanity check.

   If `ruby` is available:

   ```bash
   ruby -e "require 'yaml'; YAML.load_file('.github/workflows/governance.yml'); puts 'ok'"
   ```

   If `python` with PyYAML is available:

   ```bash
   python3 - <<'PY'
   import yaml
   with open('.github/workflows/governance.yml', 'r', encoding='utf-8') as f:
       yaml.safe_load(f)
   print('ok')
   PY
   ```

   If neither parser is available, use a careful manual review. Do not claim parser validation passed.

5. Run a diff review.

   ```bash
   git diff -- .github/workflows/governance.yml
   ```

6. Optional local gitleaks smoke test.

   If `gitleaks` is installed locally:

   ```bash
   gitleaks detect --source . --redact --no-git --verbose
   ```

   If not installed, skip this and state that CI will execute the actual action.

7. Do not run full `npm run verify`; this is workflow-only and does not affect TypeScript/runtime behavior.

## Acceptance Criteria

- `.github/workflows/governance.yml` exists.
- It runs on:
  - PRs
  - pushes to `main`
  - manual dispatch
- It has a `secret-scan` job.
- The job checks out with full history via `fetch-depth: 0`.
- The job runs `gitleaks/gitleaks-action@v2`.
- Workflow permissions remain least-privilege (`contents: read`).
- No secrets are added to the repo.
- Existing `.github/workflows/ci.yml` continues to run unchanged.
- `docs/standards/ci-cd.md` no longer overstates the implemented harness because secret scanning is now present.

## Verification Expectations

Minimum:

```bash
git diff -- .github/workflows/governance.yml
```

Plus one of:

```bash
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/governance.yml'); puts 'ok'"
```

or:

```bash
python3 - <<'PY'
import yaml
with open('.github/workflows/governance.yml', 'r', encoding='utf-8') as f:
    yaml.safe_load(f)
print('ok')
PY
```

Optional:

```bash
gitleaks detect --source . --redact --no-git --verbose
```

Do not claim the GitHub Action itself passed until it has run in GitHub Actions.

## Risk Assessment

Risk: Low to medium.

Low because this is CI-only and does not alter app behavior.

Medium because adding a secret scanner can block PRs if the repository has existing committed high-entropy examples, placeholder tokens, or false positives.

Expected false-positive candidates in this repo:

- `env.example`
- `docs/**`
- `prisma/migrations/**`
- OpenAPI examples
- test fixtures
- dummy JWT/JWK examples if present later

Important: do not preemptively add broad allowlists. Let the first scanner output identify actual findings.

## If Gitleaks Fails On Existing Content

The implementation agent should not hide findings casually.

Use this decision tree:

1. If the finding is a real secret:
   - stop
   - report the exact path and finding type
   - do not paste the secret value into chat or docs
   - rotate the credential before merging
   - remove it from the repo
   - decide separately whether history cleanup is required

2. If the finding is a placeholder/example:
   - prefer changing the example to a clearly fake value that scanners understand
   - examples:
     - `re_placeholder`
     - `<GRAFANA_CLOUD_OTLP_TOKEN>`
     - `<your-secret-access-key>`
   - keep examples obviously non-operational

3. If the finding is an unavoidable test fixture:
   - add the narrowest possible gitleaks allowlist/config
   - document the reason in the config
   - avoid path-wide ignores unless unavoidable

4. If many findings are false positives:
   - add `.gitleaks.toml`
   - keep rules narrow
   - rerun the scan

## Optional Follow-Up: Add Local Script

This is not required for the first implementation, but a later hardening step could add:

```json
{
  "scripts": {
    "secrets:scan": "gitleaks detect --source . --redact --no-git --verbose"
  }
}
```

Do not add this in the first pass unless `gitleaks` installation strategy is agreed. GitHub Actions can run the scanner without adding local Node dependencies.

## Optional Follow-Up: Merge Dependency Review Into Governance

Mobile has `dependency-review` and `secret-scan` in governance. Backend currently runs dependency review in `ci.yml`.

Do not move dependency review in the first pass. That is a separate workflow reshaping decision. The first pass should be minimal and reversible:

- add secret scanning
- leave existing CI behavior intact

## Files To Change

Required:

- `.github/workflows/governance.yml`

Usually not required:

- `.github/workflows/ci.yml`
- `docs/standards/ci-cd.md`
- `package.json`

Only add these if scanner output requires it:

- `.gitleaks.toml`

## Handoff Summary

Implement a separate `Governance Checks` workflow modeled after mobile’s secret-scan job. Use gitleaks, full checkout history, PR/main/manual triggers, and minimal permissions. Validate YAML locally if possible. Do not add suppressions unless the first scanner run proves they are needed.
