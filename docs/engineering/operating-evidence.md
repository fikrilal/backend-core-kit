# Harness Oracles And Operating Evidence

This document defines the Phase 7 evidence signals and the boundary between a
local task episode and a reviewed operating record.

## Calibrated Baselines

The measured unit baseline on 2026-08-10 was:

| Metric     | Measured | Enforced floor |
| ---------- | -------: | -------------: |
| Statements |   49.02% |            45% |
| Branches   |   42.82% |            38% |
| Functions  |   44.43% |            40% |
| Lines      |   50.64% |            46% |

The floor prevents a material repository-wide regression. It is intentionally
below the observation and must not be raised merely to optimize a score.
Critical behavior still needs explicit scenario evidence.

Profile durations are calibration observations:

| Profile   | Observed baseline | Advisory budget |
| --------- | ----------------: | --------------: |
| `fast`    |               60s |            120s |
| `full`    |              135s |            240s |
| `runtime` |               32s |            120s |
| `ci`      |              167s |            360s |

Exceeding a budget prints an advisory and does not fail verification. Change a
budget only from reviewed clean-checkout observations, not one slow laptop run.

## High-Risk Acceptance Oracles

`tools/backendkit/oracles/high-risk-oracles.ts` maps auth, account deletion,
last-admin RBAC, idempotency, rate limiting, and queue retry/finalization to
existing integration or E2E suites. Validate the registry with:

```bash
npm run backendkit -- oracles check
```

The validator rejects duplicate IDs, missing evidence, and mappings to ordinary
unit specs. The runtime suite remains the independent execution environment.

## Mutation Pilot

The pilot mutates only
`tools/backendkit/verification/lane-selection.ts` with Stryker's Jest runner:

```bash
npm run test:mutation:pilot
```

The JSON report is local and ignored at `.tmp/mutation/phase7.json`. The pilot
is not part of `fast`, `full`, `runtime`, or hosted CI. Run it when lane
selection or its tests change. Expanding scope or making it blocking requires a
new decision based on observed value and duration.

## Operating Ledger

`docs/engineering/operating-evidence-ledger.json` is a strict sanitized ledger,
not a dump of `.tmp/backendkit/` state. Check it with:

```bash
npm run backendkit -- evidence check
```

Promotion requires all of the following:

1. A real task episode has a stable terminal outcome.
2. A human independently reviews the outcome and evidence.
3. Hosted CI reproduces the required lanes from the exact recorded revision.
4. A separately authorized execution plan includes the ledger path.
5. The proposed entry records only the schema fields and passes `evidence check`.
6. Normal source review accepts the ledger change.

Entries contain hashes, stable categories, passed lane durations, a
`human:<reviewer>` identity, and a credential-free GitHub Actions run URL. They
cannot contain prompts, reasoning, raw command output, environment values,
credentials, tokens, request bodies, PII, or unrestricted review prose.

The initial ledger is empty because earlier local episodes have not completed
this independent review contract. Hill-climbing recommendations remain
ineligible until the ledger has five unique reviewed tasks, two risk classes,
and at least one repair or escalation. Eligibility is advisory and never grants
authority to create work or alter policy.
