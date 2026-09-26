# Backendkit CLI

`backendkit` is the repository-local command surface for backend harness
orchestration. It owns verification profile composition and delegates each
check to the existing npm sensor that already owns that behavior.

## Commands

```bash
npm run backendkit -- --help
npm run backendkit -- verify
npm run backendkit -- verify --profile fast
npm run backendkit -- verify --profile full
npm run backendkit -- verify --profile runtime
npm run backendkit -- verify --profile ci
npm run backendkit -- task begin --plan docs/exec-plans/active/<plan>.md
npm run backendkit -- task preflight --task <task-id> --action verify
npm run backendkit -- task verify --task <task-id>
npm run backendkit -- task workspace prepare --task <task-id>
npm run backendkit -- task workspace status --task <task-id>
npm run backendkit -- task workspace cancel --task <task-id>
npm run backendkit -- task workspace cleanup --task <task-id>
npm run backendkit -- events run --once
npm run backendkit -- maintenance run --once
npm run backendkit -- ci classify --base <sha> --head <sha>
npm run backendkit -- handoff dry-run --task <task-id> --action commit
npm run backendkit -- handoff dry-run --task <task-id> --action push
npm run backendkit -- handoff dry-run --task <task-id> --action draft-pr
npm run backendkit -- oracles check
npm run backendkit -- evidence check
npm run backendkit -- improve check
npm run backendkit -- improve analyze
npm run backendkit -- improve shadow --hypothesis <id>
npm run backendkit -- risk classify --plan docs/exec-plans/active/<plan>.md
npm run backendkit -- knowledge check
npm run backendkit -- doctor
npm run backendkit -- scaffold feature <name> [--tier simple|clean] [--with-queue] [--dry-run] [--force]
```

## Profiles

| Profile   | Purpose                                                                      |
| --------- | ---------------------------------------------------------------------------- |
| `fast`    | Deterministic static checks and unit tests; used by `npm run verify`         |
| `full`    | Complete non-Docker CI-equivalent checks; used by `npm run verify:ci-local`  |
| `runtime` | Docker-backed migrations, integration, and E2E; used by `npm run verify:e2e` |
| `ci`      | `full` followed by `runtime`; used by hosted CI through `npm run verify:ci`  |

The typed registry under `tools/backendkit/verification/` is the source of
truth for profile order. CI and compatibility aliases must call these profiles
instead of copying their step lists.

## Ownership

- `tools/backendkit/feature/` owns feature scaffolding, module unwiring, baseline
  pruning, and feature teardown lifecycle orchestration.
- `tools/backendkit/process-runner.ts` owns structured subprocess execution.
- `tools/backendkit/verification/profile-registry.ts` owns profile composition.
- `tools/backendkit/verification/run-profile.ts` owns fail-fast execution and
  profile output.
- `tools/backendkit/task/` owns V2 plan parsing, Git baselines, local task state,
  path ownership, and preflight.
- `tools/backendkit/policy/risk-classifier.ts` owns conservative changed-path
  risk rules and stable rule IDs.
- `tools/backendkit/knowledge/` owns execution-plan lifecycle validation.
- `tools/backendkit/verification/lane-selection.ts` owns risk/impact-derived
  lane selection; `failure-taxonomy.ts` owns stable failed boundaries.
- `tools/backendkit/task/task-verification.ts` owns attempts, transitions, and
  bounded repair decisions.
- `tools/backendkit/evidence/` owns redacted transient diagnostics and sanitized
  episode schemas.
- `tools/backendkit/workspace/` owns the short repository command lock,
  linked-worktree identity, private workspace metadata, and safe cleanup.
- `tools/backendkit/events/` owns queued-plan discovery, deterministic event
  identity, private receipts, single-flight activation, and interrupted-intake
  recovery.
- `tools/backendkit/maintenance/` owns the fixed one-shot observation registry.
- `tools/backendkit/handoff/` owns fresh-evidence inspection, expiring
  action-scoped approvals, and the narrow commit/push/draft-PR adapters.
- `tools/backendkit/ci/` owns clean base/head risk and runtime classification.
- `tools/backendkit/oracles/` owns high-risk acceptance-to-runtime-evidence
  mappings; `tools/backendkit/evidence/operating-ledger.ts` owns the sanitized
  ledger and advisory Phase 8 eligibility calculation.
- `tools/backendkit/improvement/` owns deterministic trend aggregation, strict
  hypothesis lifecycle validation, isolated-plan checks, and read-only shadow
  evaluation.
- `tools/backendkit/doctor/` owns read-only repository prerequisite and policy
  readiness inspection.
- Existing scripts and npm commands continue to own OpenAPI, Prisma, env,
  architecture, duplication, tests, and runtime dependency behavior.

The CLI is harness tooling. Production code under `apps/` and `libs/` must not
import it.

## Readiness Inspection

`doctor` validates required local executables, canonical repository identity,
the ignored private-state root, plan/oracle/evidence/improvement schemas, and
persisted state/workspace metadata. It also reports Docker readiness without
making Docker mandatory for non-runtime profiles. It prints status categories,
not environment values or credentials, and changes no state.

An active lifecycle record whose plan is no longer under `active/` is reported
as a stale local warning. The doctor does not delete or rewrite task evidence.

Repository code cannot prove host sandbox policy or credential isolation; the
Codex host owns those controls. `verify:e2e` remains the authoritative runtime
test even when doctor reports Docker ready.

## Structured Tasks

New active and queued execution plans use the V2 metadata documented in
`docs/exec-plans/README.md`. Begin captures the current Git revision and dirty
paths under ignored `.tmp/backendkit/tasks/<task-id>/state.json`. State contains
paths, hashes, authority, and lifecycle metadata only; it must not contain raw
command output, environment values, prompts, credentials, tokens, or PII.

Preflight checks the requested action, authority fingerprint, committed and
worktree changes, path scope, and effective risk. Risk classification may raise
the declared risk and never lower it. This phase reports whether a task may
proceed; profile selection, repair, and evidence episodes remain separate
controller behavior.

`task verify` runs that preflight and then selects canonical lanes:

| Effective task condition                     | Required lanes   |
| -------------------------------------------- | ---------------- |
| Low risk, no runtime impact                  | `fast`           |
| Medium/high risk, no runtime impact          | `full`           |
| Any selected static lane plus runtime impact | static + runtime |

Runtime impact comes from V2 impact declarations and conservative changed-path
rules. Harness-only high risk does not imply Docker runtime. A successful task
moves to `ready_for_review`; high risk still requires human review.

On failure, the controller writes a redacted diagnostic capped at 16 KiB and a
sanitized attempt episode under `.tmp/backendkit/tasks/<task-id>/`. The initial
failure enters `repairing`. Each unchanged rerun consumes one repair
opportunity; after `Repair limit` such opportunities fail, the next unchanged
failure escalates. Changing the relevant task fingerprint resets that failed
boundary's repeat count.

Episodes and state are local controller artifacts, not commit candidates. They
never grant commit, push, PR, merge, migration, or deployment authority.

## Verified Handoff

`ready_for_review` is necessary evidence, not publication authority. For each
publication action, the current agent first runs a sanitized dry-run and shows
the user its exact action, verification attempt, branch, credential-free
remote identity, changed paths, and expiry:

```bash
npm run backendkit -- handoff dry-run --task <task-id> --action <commit|push|draft-pr>
```

After the user explicitly authorizes that one action, the current agent passes
the fresh one-time value through `BACKENDKIT_HANDOFF_APPROVAL` and invokes only
the matching command:

```bash
BACKENDKIT_HANDOFF_APPROVAL=<approval> npm run backendkit -- handoff commit --task <task-id> --message <message>
BACKENDKIT_HANDOFF_APPROVAL=<approval> npm run backendkit -- handoff push --task <task-id>
BACKENDKIT_HANDOFF_APPROVAL=<approval> npm run backendkit -- handoff draft-pr --task <task-id> --base <branch> --title <title>
```

Approvals are independent and expire after 15 minutes. Every mutation repeats
freshness and repository checks. Commit uses exact task-path staging, push is
normal and non-force, and PR creation is draft-only. Merge, deploy, migration,
force push, branch deletion, and PR-ready operations are absent. An uncertain
external outcome is locked against automatic retry and requires manual
reconciliation.

The repository stores only the approval hash. It cannot authenticate the human
speaker; explicit user authorization in the active conversation remains the
operating authority.

## Hosted CI

`.github/workflows/ci.yml` runs independent clean-checkout jobs:

| Job             | Responsibility                                                   |
| --------------- | ---------------------------------------------------------------- |
| `CI Risk`       | Classify base/head paths and changed V2 plan declarations        |
| `CI Full`       | Run the canonical non-Docker `verify:ci-local` alias             |
| `CI Runtime`    | Conditionally run the canonical Docker-backed `verify:e2e` alias |
| `CI Governance` | Dependency review and secret scanning                            |
| `CI Required`   | Aggregate every selected lane into one stable required status    |

CI never treats local task episodes as pass evidence. Third-party actions use
full immutable SHAs, checkout credentials are not persisted, permissions are
read-only, and only approved coverage/runtime evidence may be retained.

## Test Oracles And Operating Evidence

`oracles check` validates that each high-risk acceptance scenario maps to an
existing integration or E2E suite. `evidence check` validates the versioned
sanitized ledger and reports whether the accepted five-task/two-risk/one-
repair-or-escalation threshold has been reached. Neither command creates tasks,
promotes episodes, changes policy, or grants authority.

Coverage floors and advisory profile duration budgets provide broad regression
signals. The manual `npm run test:mutation:pilot` command samples the pure lane-
selection policy and is not part of canonical profiles. Promotion from a local
episode to the ledger remains a separately planned, independently reviewed
source edit. See `docs/engineering/operating-evidence.md`.

## Controlled Harness Improvement

`improve check` validates the improvement lifecycle, `improve analyze` reports
deterministic sanitized trends, and `improve shadow` compares a declared
hypothesis with later reviewed tasks. All are read-only. While operating
evidence is below eligibility, only an empty improvement ledger is valid and
analysis/shadow evaluation report disabled.

Approved improvements require separate human approval and an isolated high-risk
V2 plan with exactly edit/verify authority. Terminal keep/revert records must
match shadow evidence. The controller never creates the plan, edits policy,
rolls out code, or publishes the result. See
`docs/engineering/controlled-hill-climbing.md`.

## Current-Agent Task Workspace

The user continues working through one normal Codex conversation. The current
agent invokes these commands internally; `backendkit` never launches Codex or
another coding agent.

After `task begin`, `task workspace prepare --task <id>` acquires a short
repository command lock, creates `backendkit/<task-id>` from the authorized
base under the ignored `.tmp/backendkit/worktrees/` directory, materializes the
immutable plan snapshot, and returns the canonical working path. The current
agent then uses ordinary tool calls with that path as `workdir`. User-owned
dirty paths in the primary worktree are not copied.

`task workspace status` validates repository identity, plan authority, base
ancestry, branch, and canonical path after context compaction, interruption, or
a later conversation turn. There is no agent-process resume operation: the
current conversation simply rediscovers the workspace and continues.

When workspace metadata exists, `task preflight` and `task verify`
automatically inspect and verify the candidate worktree. Verification failures
remain bounded by the Phase 3 repair budget and diagnostics. The current agent
repairs the same candidate through normal tool calls and invokes verification
again.

Task lifecycle remains in `state.json`; strict adapter-neutral Git metadata is
stored in mode-0600 `workspace.json`. It rejects model, prompt, output, session,
environment, credential, and PID fields. Cancellation only records task state;
interrupting Codex remains the host's responsibility.

`task workspace cleanup` requires a stopped task and a clean validated
worktree. It removes the linked worktree but preserves the candidate branch;
dirty work is retained for inspection.

## Event Intake

`events run --once` is an internal one-shot command for the current agent or an
approved external scheduler. It does not run continuously and never launches a
coding agent.

The command validates all queued V2 plans, refuses another active task or plan,
and selects at most one lexically ordered new delivery. A queued plan already
contains approved authority; the event changes only `Status` from `queued` to
`active` and moves the same filename from `docs/exec-plans/queued/` to
`docs/exec-plans/active/`. Its authority hash must not change.

Before activation, the controller creates a mode-0600 receipt under
`.tmp/backendkit/events/<event-id>.json`. Event identity is derived from the
source, task ID, and queued source hash. Repeated delivery is therefore
idempotent. A claimed receipt is resumed before new intake; exact plan hashes,
active destination, task state, and single-flight ownership must agree or the
command fails closed.

Successful intake creates normal authorized task state and prints its task ID.
The current conversational agent can then invoke `task workspace prepare` and
continue through ordinary tools. Intake grants no new path, action, risk,
network, publication, migration, or deployment authority.

## Scheduled Maintenance

`maintenance run --once` executes a fixed sequence owned by source code:

1. execution-plan knowledge validation;
2. architecture-smell observations;
3. duplication observations;
4. production dependency audit.

An external scheduler may invoke this command. There is no repository daemon,
timer, Redis, or BullMQ dependency. Maintenance is read-only with respect to
source, policy, plans, baselines, and authority; the existing architecture and
duplication sensors may refresh their three explicit `_WIP` reports. The
dependency audit may use package-registry network access. A failed step stops
the sequence, and no observation automatically creates an authorized task.

Pre-existing dirty paths are user-owned at begin. If their content later
changes, they become task-owned and must fit the allowed scope. This is
path-level protection, not a substitute for isolated worktrees when two actors
need the same file.

The three exact untracked reports produced by the architecture and duplication
sensors are reported separately as controller artifacts. They are never
treated as task-owned source and are never included in commits. This exception
is an explicit file list, not an `_WIP/` wildcard.

The runtime profile preserves the documented default dependency ports. When
another local stack owns those ports, the Compose-only `POSTGRES_HOST_PORT`,
`REDIS_HOST_PORT`, `MINIO_API_HOST_PORT`, and `MINIO_CONSOLE_HOST_PORT`
variables may select alternate host ports. Supply matching `DATABASE_URL`,
`REDIS_URL`, and `STORAGE_S3_ENDPOINT` values to the runtime profile. These
host-port controls are development harness settings, not application config.

## Compatibility

Keep `verify`, `verify:ci-local`, and `verify:e2e` stable for developers and
automation. They are aliases, not independent pipeline definitions.

When adding or changing a profile step:

1. update the typed registry;
2. update focused profile/parity tests;
3. update this reference and relevant standards;
4. treat the change as high-risk harness work;
5. verify locally and through clean-checkout CI.

When changing task metadata, state schemas, authority, or risk rules, also
update their negative fixtures and treat the change as high-risk harness work.
