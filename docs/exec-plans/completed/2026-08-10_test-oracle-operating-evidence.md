# Test Oracle And Operating Evidence Maturity

**Plan version:** 2
**Task ID:** test-oracle-operating-evidence-20260810
**Status:** completed
**Owner:** Dante and Codex
**Risk:** high
**Authority:** implement and verify Phase 7 locally; no evidence promotion without independent review and no commit, push, PR, merge, deployment, migration, or external mutation
**Allowed paths:** _WIP/2026-08-09_backend-loop-engineering-proposal.md, .gitignore, docs/adr/0025-test-oracles-operating-evidence.md, docs/adr/README.md, docs/engineering/backend-runtime-evidence.md, docs/engineering/backendkit-cli.md, docs/engineering/guardrails.md, docs/engineering/operating-evidence-ledger.json, docs/engineering/operating-evidence.md, docs/exec-plans/README.md, docs/exec-plans/active/2026-08-10_test-oracle-operating-evidence.md, docs/exec-plans/completed/2026-08-10_test-oracle-operating-evidence.md, docs/standards/testing-strategy.md, jest.config.cjs, package-lock.json, package.json, stryker.config.mjs, tools/backendkit/
**Allowed actions:** edit, verify
**Maximum risk:** high
**Repair limit:** 2
**Task timeout:** 6h

Date: 2026-08-10
Related issue/PR: N/A

## Objective

Implement Phase 7 with conservative measured coverage floors, advisory duration
budgets, a mechanically validated high-risk acceptance-oracle registry, one
narrow non-default mutation-testing pilot, stronger durable-evidence negative
fixtures, and a strict sanitized operating ledger that remains ineligible for
hill climbing until independently reviewed real episodes satisfy the accepted
threshold.

## Constraints

- Coverage floors prevent material regression but must not incentivize
  low-value tests or claim that coverage proves behavior.
- Duration budgets are advisory during calibration; timing variance must not
  become a flaky CI failure.
- High-risk scenarios map to independent integration/E2E evidence owned outside
  the implementation under test.
- Mutation testing is limited to one pure critical harness module and is not a
  default full/CI profile step.
- Only independently reviewed, clean-checkout-reproduced episodes may enter the
  versioned ledger. This implementation does not fabricate qualifying entries.
- The ledger contains bounded structured metadata only: no prompts, reasoning,
  raw output, environment values, credentials, tokens, request bodies, PII, or
  unrestricted review prose.
- Hill-climbing eligibility remains a deterministic report, never an automatic
  policy change or task authorization.
- Preserve canonical npm profile ownership and existing compatibility aliases.

## Impact Areas

- API/OpenAPI: no
- DB/Prisma/migrations: no
- Auth/session/RBAC: no
- Queue/jobs: no
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: no
- CI/release/harness: yes

## Acceptance Criteria

1. Coverage runs enforce conservative floors derived from the measured current
   baseline and document both baseline and floor values.
2. Fast/full/runtime profile durations are compared with documented advisory
   budgets without failing verification solely because of elapsed time.
3. Every registered high-risk acceptance scenario has stable identity,
   observable acceptance, and existing independent integration/E2E evidence;
   invalid, duplicate, missing, or unit-only mappings fail validation.
4. A manually invoked Stryker pilot mutates only the selected pure harness
   policy module, emits a bounded local report, and is absent from canonical
   fast/full/runtime/CI profiles.
5. Episode and ledger parsers reject unknown fields, non-canonical paths,
   secret-shaped values, PII-shaped values, oversized content, duplicate
   identity, and inconsistent review/CI metadata.
6. The empty initial ledger validates, reports its exact evidence counts, and
   remains ineligible until five reviewed tasks span two risk classes and
   include at least one repair or escalation.
7. ADR, testing, CLI, guardrail, runtime-evidence, execution-plan, and proposal
   documentation explain the oracle and promotion boundaries.

## Implementation Checklist

- [x] Add conservative coverage floors and advisory duration budgets.
- [x] Add and validate the high-risk acceptance-oracle registry.
- [x] Add the narrow non-default mutation pilot and local report hygiene.
- [x] Harden sanitized episode parsing and negative fixtures.
- [x] Add strict operating-ledger schema, eligibility reporting, and fixtures.
- [x] Update ADR and operating documentation.
- [x] Run focused, full, mutation-pilot, and applicable runtime verification.

## Decision Log

- 2026-08-10: Use conservative floors below the measured baseline -> prevent
  large regressions without rewarding tests written only to increase a number.
- 2026-08-10: Keep duration budgets advisory -> establish operating signal
  before making timing a potentially flaky gate.
- 2026-08-10: Keep the mutation pilot out of canonical profiles -> follow the
  accepted one-module pilot boundary and measure cost before wider adoption.
- 2026-08-10: Start the ledger empty -> prior local episodes have not yet
  received independent review and clean-checkout evidence.
- 2026-08-10: Validate promotion through reviewed versioned entries rather than
  adding an autonomous source-writing command -> human code review remains the
  authority boundary and the implementation stays KISS.
- 2026-08-10: Preserve terminal-state honesty by persisting a valid episode
  before the terminal task state -> an evidence schema/write failure cannot
  falsely leave a task ready for review.
- 2026-08-10: Keep the 70 mutation break threshold after the first 62.5% pilot
  -> add missing policy tests rather than weakening the oracle; the rerun killed
  all 96 mutants.

## Verification

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run verify:oracles` — passed; 6 high-risk scenarios validated.
- `npm run verify:evidence` — passed; 0 reviewed tasks, 0 risk classes, and 0
  repairs/escalations; Phase 8 correctly ineligible.
- `npx jest --runInBand tools/backendkit` — 27 suites and 133 tests passed.
- `npm run test:mutation:pilot` initial calibration — correctly failed at
  62.5%; 60 killed, 26 survived, and 10 had no coverage.
- `npm run test:mutation:pilot` after focused oracle cases — passed at 100%; all
  96 mutants killed in approximately 25 seconds.
- Controller attempt 1 ran the full profile successfully but strict episode
  validation found duplicate risk-rule IDs. Private task state was explicitly
  reconciled after the non-terminal evidence failure; no source gate was
  bypassed.
- Controller attempt 2 / canonical full profile — passed and wrote sanitized
  episode `attempt-2.json`; coverage floors, OpenAPI, gate honesty, boundaries,
  oracle/ledger checks, and production audit all passed.
- `npm audit --audit-level=moderate` — passed with 0 vulnerabilities after a
  compatible `typed-rest-client` -> `qs@6.15.3` transitive override.
- Clean `npm ci` — passed with 0 vulnerabilities; standalone typecheck before
  Prisma generation failed as expected because install does not generate the
  client. `npm run prisma:generate` followed by typecheck and lint passed,
  matching canonical profile ordering.
- Runtime profile — not selected by canonical policy because no application,
  database, auth, queue, environment, external-adapter, or runtime behavior
  changed.

## Runtime Evidence

- Environment: local repository, Stryker sandbox, and isolated Compose project
  if canonical runtime evidence is selected.
- Dependencies/services: Node.js toolchain; Docker only for the runtime lane.
- Executed request/job/flow: high-risk oracle registry validation, strict empty
  ledger eligibility, full clean local profile, and one-module Stryker pilot.
- Artifact path(s): `.tmp/mutation/phase7.json` and private task episode
  `.tmp/backendkit/tasks/test-oracle-operating-evidence-20260810/episodes/attempt-2.json`.
- Relevant log/trace/request IDs: N/A.
- Notes: no real episode was promoted. Mutation and episode artifacts remain
  ignored local evidence.

## Risks And Mitigations

- Risk: coverage becomes a vanity metric.
  Mitigation: conservative regression floor plus explicit scenario evidence.
- Risk: duration enforcement flakes on shared runners.
  Mitigation: warnings only until reviewed operating evidence supports a gate.
- Risk: the implementation validates its own misunderstanding.
  Mitigation: map high-risk rules to independent integration/E2E suites and
  exercise one policy module with mutation testing.
- Risk: durable evidence leaks secrets or PII.
  Mitigation: strict allowlists, canonical formats, bounded files, negative
  secret/PII fixtures, and no raw review prose.
- Risk: ledger entries are mistaken for hill-climbing authority.
  Mitigation: deterministic eligibility reporting remains advisory and cannot
  create or authorize tasks.

## Completion Notes

- Added measured coverage floors and non-blocking duration advisories.
- Added six mechanically validated high-risk acceptance/runtime mappings.
- Added the manual Stryker pilot and expanded lane-selection tests until all 96
  generated mutants were killed without adding it to canonical CI profiles.
- Hardened episode identity/path/value handling and terminal persistence order.
- Added an empty strict operating ledger and deterministic advisory eligibility
  check; Phase 8 remains intentionally disabled.
- Added ADR 0025 and updated testing, CLI, evidence, guardrail, plan, and
  proposal documentation.
- No commit, publication, or external mutation was performed for Phase 7.

## Follow-Ups

- [ ] Recalibrate budgets only from reviewed clean-checkout observations.
- [ ] Add unresolved debt to `docs/exec-plans/tech-debt-tracker.md`.
