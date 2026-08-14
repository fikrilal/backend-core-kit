# Loop Engineering Production Readiness And Release

**Plan version:** 2
**Task ID:** loop-engineering-production-readiness-20260810
**Status:** active
**Owner:** Dante and Codex
**Risk:** high
**Authority:** audit, complete, document, verify, commit, rewrite dates of commits not present on origin/development, push development, create or update the release pull request, and merge it to main after required GitHub checks pass; one exact-tip lease-guarded development update is authorized solely to remove CommandCode co-author trailers requested after the first push; no other force push, deployment, migration, production credential use, policy weakening, fabricated operating evidence, or branch deletion
**Allowed paths:** _WIP/2026-08-09_backend-loop-engineering-proposal.md, README.md, docs/, tools/backendkit/, .github/, .gitleaksignore, libs/platform/otel/telemetry.spec.ts, package.json, package-lock.json
**Allowed actions:** edit, verify, commit, push, draft-pr, update-pr, merge
**Maximum risk:** high
**Repair limit:** 2
**Task timeout:** 12h

Date: 2026-08-10
Related issue/PR: N/A

## Objective

Prove that the repository-local loop-engineering machinery is production-ready
end to end, close genuine implementation and documentation gaps, preserve the
evidence threshold instead of fabricating operational maturity, and publish the
verified development history through the normal GitHub review and CI path.

## Constraints

- All eight implementation phases must map to versioned code, tests, ADRs, and
  operator documentation.
- The end-to-end scenario must exercise real task, workspace, verification, and
  handoff boundaries without mutating an external remote.
- Phase 8 remains operationally disabled until five independently reviewed real
  tasks satisfy the accepted evidence contract.
- Existing unpushed commits may have author and committer dates rewritten only
  after a recoverable local backup ref is created and the exact remote boundary
  is revalidated.
- Rewritten timestamps must be ordered, naturally distributed from 2026-08-11
  through 2026-08-14, and use the Asia/Jakarta `+07:00` offset.
- Push is normal and non-force except for the single exact-tip
  `--force-with-lease` correction recorded in this plan. Merge occurs only after
  required pull-request CI is green. Main CI must also be observed after merge.
- Generated `_WIP` reports remain uncommitted. The accepted loop proposal may
  be committed as a historical design record.

## Impact Areas

- API/OpenAPI: no
- DB/Prisma/migrations: no
- Auth/session/RBAC: no
- Queue/jobs: no
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: yes
- CI/release/harness: yes

## Acceptance Criteria

1. A traceability review maps every proposal phase and acceptance condition to
   implementation and evidence, explicitly marking evidence-gated conditions.
2. A read-only readiness command validates the local harness prerequisites and
   reports actionable failures without exposing environment values or secrets.
3. One automated scenario traverses task authorization, isolated workspace
   preparation, task-owned editing, verification, fresh handoff approval, and
   publication-adapter invocation using only local temporary repositories.
4. README, docs index, engineering index, developer workflow, agent loop,
   backendkit CLI, and proposal consistently explain how humans and agents use
   the loop and where the authority boundaries remain.
5. Focused tests, full non-Docker verification, Docker-backed runtime
   verification, and end-to-end CLI smoke checks pass on the final source.
6. Only commits absent from `origin/development` are redated; their order,
   authors, messages, and trees are preserved, and a backup ref exists.
7. Development is pushed normally, pull-request required checks pass, the PR is
   merged to main without bypassing checks, and post-merge main CI is green.

## Implementation Checklist

- [x] Reconcile proposal phases and acceptance conditions.
- [x] Add harness readiness diagnostics and focused tests.
- [x] Add a real local end-to-end loop scenario.
- [x] Update repository, guide, engineering, and proposal documentation.
- [x] Run focused, full, runtime, and manual lifecycle verification.
- [x] Commit and safely redistribute unpushed commit timestamps.
- [ ] Push, verify pull-request CI, merge, and verify main CI.

## Decision Log

- 2026-08-10: Preserve the empty operating-evidence ledger -> implementation
  readiness is testable now, but real-world hill-climbing activation cannot be
  manufactured during a release pass.
- 2026-08-10: Exercise publication through a local adapter in automated tests ->
  the authority and freshness flow is covered without creating external test
  commits, pushes, or pull requests.
- 2026-08-10: Remove CommandCode co-author trailers after the initial
  development push -> preserve a backup ref and use one force-with-lease bound
  to the observed remote tip; do not alter trees, authors, dates, subjects, or
  ordering.
- 2026-08-10: The first hosted run exposed clean-checkout prerequisites and a
  secret-scanner false positive -> authorize the telemetry fixture only, give
  Prisma verification a non-secret local URL, and generate the Prisma client
  before runtime tests; retain strict scanning and ignore only the exact
  historical false-positive fingerprint because the scanner evaluates the
  complete pull-request commit range.

## Verification

- Focused doctor, command, event-intake, and cross-component scenario: 4 suites
  and 18 tests passed.
- Complete backendkit suite: 31 suites and 145 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run verify:project-map`: passed with 127 checked links/items.
- `npm run backendkit -- doctor`: passed required checks, reported Docker ready,
  and truthfully warned about eight ignored historical task states whose plans
  have already moved out of `active/`.
- `npm run backendkit -- maintenance run --once`: passed all four registered
  observations; production dependency audit found zero vulnerabilities.
- Evidence and improvement check/analyze/shadow commands passed and remained
  disabled at the zero-task evidence threshold.
- Controlled verification attempt 1: `full` passed; `runtime` entered repair
  because another local project occupied the default dependency ports.
- Controlled verification attempt 2 with isolated ports: `full` passed;
  `runtime` entered repair because the default Compose project reused a stale
  local Postgres volume.
- Controlled verification attempt 3 with isolated ports and a unique Compose
  project: `full` and `runtime` passed.
- History validation preserved all 43 original tree/author/message-subject
  records while distributing timestamps monotonically from August 11–14 in
  Jakarta time. A later message-only rewrite removed all CommandCode co-author
  trailers while preserving tree, author, date, subject, and order metadata.
- GitHub Actions run `31411348848` reached all selected lanes. Risk and
  GitGuardian passed; Full lacked the non-secret Prisma configuration needed by
  a clean checkout, Runtime lacked generated Prisma client exports, and
  Governance correctly rejected a secret-like telemetry test fixture.

## Runtime Evidence

- Environment: local repository, temporary local Git repositories, Docker-backed dependencies, and GitHub Actions.
- Dependencies/services: Node.js toolchain, Git, Docker Compose dependencies, and GitHub.
- Executed request/job/flow: V2 task begin/preflight, doctor inspection,
  maintenance, evidence/improvement fail-closed checks, temporary-Git lifecycle
  scenario, bounded repair, full verification, migrations, integration tests,
  and E2E tests.
- Artifact path(s):
  `.tmp/backendkit/tasks/loop-engineering-production-readiness-20260810/episodes/attempt-3.json`.
- Relevant log/trace/request IDs: task
  `loop-engineering-production-readiness-20260810`, attempt 3.

## Risks And Mitigations

- Risk: history rewriting changes already-published commits.
  Mitigation: calculate the boundary from `origin/development`, fetch before the
  rewrite, create a local backup ref, and compare commit metadata/tree order.
- Risk: end-to-end claims rely only on isolated unit tests.
  Mitigation: add a cross-component temporary-repository scenario and manually
  exercise the actual CLI/controller on this task.
- Risk: evidence is fabricated to activate hill climbing.
  Mitigation: preserve the empty ledger and document activation as a real-world
  operational milestone.
- Risk: local success diverges from hosted behavior.
  Mitigation: require green pull-request CI and green post-merge main CI.

## Completion Notes

- Phase 1–8 implementation traceability is explicit and the documentation now
  separates production-ready machinery from evidence-gated hill-climbing
  activation.
- The readiness doctor is read-only, value-minimizing, and reports optional
  runtime availability and orphaned local lifecycle state without deleting it.
- The cross-component scenario reaches terminal handoff and proves event intake
  becomes idle after the plan is completed.
- Conditions 14–15 remain honest operating milestones; no evidence was
  fabricated or promoted during this release.

## Follow-Ups

- [ ] Promote real episodes only after independent review and exact-revision CI.
- [ ] Reconcile or remove ignored historical task state only after confirming
      none represents active work; this local cleanup is not a repository change.
