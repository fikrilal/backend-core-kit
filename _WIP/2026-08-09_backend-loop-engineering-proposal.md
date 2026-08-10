# Engineering Proposal: End-to-End Backend Harness And Loop Engineering

**Date:** 2026-08-09

**Status:** Accepted — phases 1 through 8 implemented; operational evidence
gates 14–15 pending

**Decision owner:** Repository owner

**Risk:** High — this changes repository control, agent workflow, CI, and
potential external-action boundaries

## Decision Summary

Build a repository-local harness and loop-engineering system named
`backendkit`. It will harden the current backend guardrails first, then provide
an end-to-end bounded agent loop:

```text
authorized task or event
        ↓
isolated worktree and durable task state
        ↓
current conversational agent edits through normal tool calls
        ↓
scope/risk preflight and deterministic verification
        ↓
bounded repair or human escalation
        ↓
verified handoff with sanitized evidence
        ↓
aggregate real outcomes
        ↓
human-reviewed harness improvement
```

The repository will own task policy, workspace identity, verification, state
transitions, evidence, and stop conditions. The current Codex conversation
remains the only coding agent and invokes `backendkit` internally through normal
tool calls. Model invocation, conversational context, interruption, and agent
process lifecycle remain responsibilities of the Codex host; the repository
does not launch or embed another agent runtime.

The system will initially run locally or on an explicitly managed runner. It
will not become a multi-tenant agent service, and it will not grant itself
permission to commit, push, merge, migrate production data, deploy, or change
its own policy. Those actions remain separate, explicit authority boundaries.

This proposal is distinct from the supporting
[backend harness audit](2026-08-09_backend-harness-engineering-audit.md). The
audit records current evidence and gaps; this document proposes the target
architecture and decisions. Implementation sequencing and command evidence
belong in later execution plans.

## Context

The repository already has valuable deterministic sensors:

- strict TypeScript, ESLint, Prettier, and Jest;
- dependency-cruiser architecture rules;
- OpenAPI generation drift and Spectral linting;
- Prisma schema and generated-client drift checks;
- env/schema verification;
- architecture-smell baselines;
- scaffold smoke tests;
- duplication reporting and reviewed allowlists;
- Postgres, Redis, MinIO, integration, and E2E verification;
- secret scanning and dependency review in CI;
- runtime-evidence and high-risk review policy.

The current weakness is orchestration. `package.json`,
`scripts/verify-ci-local.ts`, `scripts/verify-e2e.ts`, and
`.github/workflows/ci.yml` define overlapping pipelines. Execution-plan scope,
action authority, risk, repair limits, and evidence are largely prose. The
repository cannot yet prove that an agent stayed within its task, selected the
right verification depth, made progress between repairs, or stopped safely.

The accepted direction is to treat that hardening as the foundation of a full
loop-engineering system rather than as the final outcome.

## Goals

1. Give developers, agents, and CI one canonical repository command surface.
2. Make task intent, path scope, action authority, risk, and repair limits
   machine-readable.
3. Give the current agent an isolated task worktree with recoverable state.
4. Select verification from declared impact and conservative changed-path risk.
5. Feed useful verification failures back into a bounded repair loop.
6. Stop and escalate when authority is insufficient, risk rises, progress
   stalls, or limits are exhausted.
7. Preserve sanitized task episodes that prove what ran and why the controller
   stopped.
8. Support explicit manual, queued, scheduled, and external event triggers
   without allowing a trigger to grant authority.
9. Support verified draft handoff only when separately authorized.
10. Improve the harness from recurring, independently reviewed task outcomes
    through a controlled hill-climbing loop.

## Non-Goals

- Building a general-purpose or multi-tenant agent platform.
- Replacing NestJS application runtime, BullMQ, or product queues with harness
  infrastructure.
- Allowing the agent to edit its own permissions, risk policy, baselines, or
  required checks without review.
- Automatic merge, deployment, production migration, or production secret
  access.
- Treating test count, coverage percentage, or model confidence as proof of
  correctness.
- Persisting raw prompts, model reasoning, environment values, tokens, request
  bodies, or unrestricted command output as long-lived evidence.
- Dynamically skipping backend tests based on an unproven dependency model.
- Porting all frontend harness code or the full mobile CLI implementation.
- Introducing a database, queue cluster, or hosted control service before a
  filesystem-backed local controller proves insufficient.

## Design Principles And Invariants

### Humans authorize; the controller enforces; agents execute

A plan records authority granted by a human or an already-authorized external
workflow. Parsing a plan never creates authority. A trigger, issue label,
scheduled event, model output, or repository file cannot expand allowed
actions.

### Verification owns completion

The agent may report that work is complete, but only the controller can move a
task into `ready_for_review`, based on scope, risk, required lanes, and evidence.

### Risk only moves upward automatically

Path and behavior classifiers may raise declared risk. They may not lower it.
Risk selects minimum verification and review requirements; it does not itself
grant publication or deployment authority.

### Repair is bounded and attributable

Every repair attempt has a stable failure category and task fingerprint. The
same failure without meaningful task change consumes the repair budget and
eventually escalates.

### External actions are individually authorized

`edit`, `verify`, `commit`, `push`, `draft-pr`, `update-pr`, `merge`,
`migrate`, and `deploy` are separate actions. Initial loop operation supports
only `edit` and `verify` by default. Merge, production migration, and deployment
remain disabled regardless of task risk.

### Durable evidence is minimized

Raw diagnostics may exist temporarily inside the local task directory so the
agent can repair a failure. Durable episodes contain only approved metadata,
stable categories, hashes, paths, durations, and artifact references.

### Harness changes are ordinary high-risk changes

The loop cannot bypass itself. Changes to `tools/backendkit/`, verification
profiles, risk rules, CI, plan schemas, evidence schemas, permissions,
baselines, or allowlists require high-risk verification and human review.

## Proposed System

### Component and trust boundaries

```text
┌──────────────────────────────── repository sources ────────────────────────────────┐
│ AGENTS.md  docs/  execution plan  harness policy  existing backend sensors         │
└───────────────────────────────────────┬──────────────────────────────────────────────┘
                                        │ trusted, versioned intent/policy
                                        ▼
┌──────────────────────────── backendkit repository harness ───────────────────────────┐
│ Trigger intake → Policy/Scope/Risk → Workspace State → Verification Controller       │
│                              │                │                 │                   │
│                        Task State Store    Repair Evidence      Episode Writer        │
└──────────────────────────────┼────────────────┼─────────────────┼──────────────────────┘
                               │                │                 │
                     isolated  │        structured feedback      │ sanitized metadata
                     worktree  ▼                │                 ▼
                        current Codex conversation       ignored local evidence /
                        uses ordinary tool calls         reviewed versioned ledger

Separate trust boundary:
  PublicationAdapter → git commit / push / draft PR
  Requires action-specific authority immediately before each mutation.
```

The controller is repository tooling, not part of `apps/api`, `apps/worker`, or
`libs/platform`. It must not be imported by production application code.

### Implemented repository ownership

```text
tools/backendkit/
  cli.ts                    command routing and help only
  process-runner.ts         safe subprocess ownership
  policy/
  task/
  workspace/
  verification/
  evidence/
  events/
  maintenance/
  handoff/
  ci/
  oracles/
  improvement/
  doctor/

Controller tests and fixtures are colocated under `tools/backendkit/`, including
the cross-component `loop-engineering.e2e.spec.ts` scenario. Policy remains
typed and source-local instead of introducing configuration files with no
independent consumer.
```

Existing sensors remain with their current owners until a focused change gives
them a better home. The CLI orchestrates them; it does not merge all sensor
implementations into a large framework module. Existing npm scripts remain
compatibility aliases during migration.

## Task Contract

Non-trivial loop tasks use execution-plan schema version 2. The plan remains
readable Markdown with a small parseable metadata block.

```markdown
**Plan version:** 2
**Task ID:** auth-refresh-repair-20260809
**Status:** active
**Owner:** repository owner
**Risk:** high
**Authority:** implement and verify locally; no external mutation
**Allowed paths:** libs/features/auth/, test/auth/, docs/engineering/auth/
**Allowed actions:** edit, verify
**Maximum risk:** high
**Repair limit:** 2
**Task timeout:** 90m
```

The plan also contains observable acceptance scenarios, decisions and
invariants, non-goals, impact areas, a verification matrix, rollback, and
follow-up debt.

### Plan integrity

At authorization, the controller records the plan path, base revision, and
content hash. Changes to authority-bearing metadata invalidate the task until a
human reauthorizes it. The implementation agent cannot broaden its own plan by
editing Markdown.

Allowed paths are repository-relative normalized prefixes. Absolute paths,
parent traversal, ambiguous globs, and symlink escapes are rejected. Scope
checks cover committed task changes, staged changes, unstaged changes, and
untracked paths relative to the captured base.

## Task Lifecycle

```text
queued
  │ authorization and plan validation
  ▼
authorized
  │ current agent prepares branch and isolated worktree
  ▼
preparing
  │ workspace identity and plan snapshot pass
  ▼
authorized ────────────────────────────────────────┐
  │ current agent edits through ordinary tools    │
  ▼                                               │
verifying                                         │
  ├── all required evidence passes ──→ ready_for_review
  │                                               │
  ├── repairable failure + budget ──→ repairing ──┘
  │
  ├── authority/risk/scope violation ──→ escalated
  ├── repeated failure/no progress ────→ escalated
  ├── task expiration/cancellation ─────→ cancelled
  └── unrecoverable harness failure ───→ failed

ready_for_review
  ├── separately authorized handoff ───→ handed_off
  └── human requests repair ────────────→ authorized (new attempt/audit entry)
```

Only the controller writes lifecycle state. Agent output is untrusted input.
Terminal tasks are never silently reopened.

### Concurrency and deduplication

- One short repository command owns workspace mutation through an exclusive
  command lock; the lock never represents ownership of the Codex process.
- Task IDs are unique within the repository.
- Event IDs are recorded so delivery retries do not create duplicate tasks.
- Initial default is one active agent task per repository.
- Parallel tasks require separate worktrees and non-overlapping approved paths.
- Shared outputs such as `package-lock.json`, Prisma schema, OpenAPI snapshots,
  env examples, CI, and harness policy are exclusive ownership paths.
- Lock takeover requires proof that the owning process is gone and records a
  recovery event; timeout alone does not imply safe takeover.

## Current Agent And Harness Boundary

The user works in one normal Codex conversation. That current agent reads the
authorized plan, calls `backendkit task workspace prepare` internally, and then
uses ordinary filesystem and command tools with the returned worktree as its
working directory. The repository CLI never invokes Codex, another model, or an
agent subprocess.

`workspace.json` contains only task identity, plan/authority hashes, prepared
time, repository identity, base revision, branch, and canonical worktree path.
It contains no model, prompt, output, session, credential, environment, or PID
fields. After context compaction or a new conversational turn, the current
agent calls `task workspace status` to validate the same workspace and continue.

Cancellation records task lifecycle intent. Interrupting or cancelling the
current conversational agent remains a Codex host responsibility and is never
implemented by killing a persisted process ID.

### Sandbox boundary

Path checking after execution is necessary but not sufficient. The current
Codex host supplies its normal workspace sandbox, while `backendkit` supplies a
validated task worktree and post-edit scope checks. Network connectivity does
not grant external mutation authority.

The default supervised full-capability mode permits internet research, package
registries, GitHub reads, dependency installation, normal development tools,
and local Docker-backed services. It excludes production credentials and
sensitive internal endpoints. Commit, push, PR mutation, cloud infrastructure,
production migration, and deployment remain separately authorized actions.

Future unattended event handling may notify or queue work for an approved Codex
host, but repository code still does not create the agent process. If
source-code confidentiality requires network isolation, host-level policy may
apply egress controls for that task; this is not the repository default.

## Verification And Repair Loop

### Canonical profiles

The existing checks move behind one typed registry:

| Profile   | Purpose                          | Representative contents                                                                                                                  |
| --------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `fast`    | Cheap deterministic feedback     | format, lint, typecheck, env, dependency boundaries, unit tests, OpenAPI check/lint                                                      |
| `full`    | Complete local static confidence | `fast`, Prisma drift, project-map/knowledge, scaffold smoke, architecture smells, coverage, gate honesty, build, selected security audit |
| `runtime` | Real dependency behavior         | dependency startup/readiness, migrations, integration tests, E2E tests, cleanup                                                          |
| `ci`      | Clean-checkout independent proof | frozen install, `full`, `runtime`, hosted governance controls                                                                            |

Final contents are calibrated during foundation implementation. The important
decision is that one registry owns profile meaning and CI invokes the same
owners rather than reimplementing shell steps.

Duplication remains an explicit self-review/report sensor until evidence
supports making it a blocking profile step.

### Risk-derived selection

Effective risk is the maximum of:

- declared plan risk;
- changed-path risk;
- changed execution-plan risk;
- sensitive action risk;
- runtime impact declarations.

Unknown executable paths default to medium. Auth/session/RBAC, security,
migrations, data deletion, queue contracts/idempotency, CI/harness,
dependencies, and publication behavior default to high.

Low-risk tasks run at least `fast`. Medium/high tasks run `full`. Tasks touching
database, Redis, queues, object storage, external adapters, migrations,
startup/shutdown, or critical HTTP behavior also run `runtime`. High-risk tasks
always require human review even after all lanes pass.

### Failure feedback

Each failed step produces:

- stable boundary code such as `preflight.scope`, `verify.types`,
  `verify.openapi`, `runtime.migration`, or `runtime.e2e`;
- command identifier, exit/signal/timeout status, and duration;
- redacted, size-bounded transient diagnostics;
- remediation guidance owned by the sensor;
- a task fingerprint.

The next repair attempt receives only the evidence needed to act. Raw output is
not copied into the execution plan or durable episode.

### Meaningful progress and repair limits

The fingerprint includes plan identity, approved scope, changed-path set,
relevant file hashes, effective risk, and failed boundary. A repair is
meaningful when task-owned content or approved metadata relevant to that
failure changes. Repeating the same boundary with an unchanged meaningful
fingerprint increments the stalled-repair count.

The controller escalates when:

- the repair limit is reached;
- effective risk exceeds maximum authorized risk;
- changed paths escape scope;
- required human input is missing;
- a failure is classified terminal;
- the agent attempts an unauthorized external action;
- task or attempt timeout is reached;
- the controller cannot prove exclusive ownership.

The controller never responds by weakening a test, changing a baseline, or
expanding scope automatically.

## Event-Driven Loop

Trigger adapters normalize events into untrusted task requests:

```ts
interface TaskTrigger {
  poll(): Promise<ReadonlyArray<TaskRequest>>;
}
```

Initial supported triggers:

1. Explicit plan authorization followed by the current agent's internal
   `backendkit task workspace prepare --task <id>` call.
2. Repository queue: a valid plan under `docs/exec-plans/queued/` selected by
   `backendkit events run --once`.
3. Scheduled read-only maintenance: knowledge, architecture, duplication, and
   dependency observations. A human may use those results to create a proposed
   task; maintenance itself cannot edit policy or application code.

Later adapters may consume GitHub issue labels, pull-request check failures, or
webhooks. They must deduplicate delivery, validate repository/base identity,
and produce a task request only. They cannot grant actions or change risk.

GitHub-hosted ephemeral runners remain independent verification environments,
not the owner of conversational agent state. The current Codex host owns the
conversation; repository workspace metadata makes task continuation
rediscoverable without trying to serialize model state.

## State, Evidence, And Recovery

### Authoritative stores

| Data                                  | Source of truth                              | Versioned?                                          |
| ------------------------------------- | -------------------------------------------- | --------------------------------------------------- |
| Intent, acceptance, granted authority | Approved execution plan                      | Yes                                                 |
| Architecture and verification policy  | Repository docs/config/code                  | Yes                                                 |
| Active lifecycle and lock             | `.tmp/backendkit/tasks/<task-id>/state.json` | No                                                  |
| Attempt diagnostics                   | Task-local restricted log directory          | No; short-lived                                     |
| Candidate code                        | Isolated git worktree and task branch        | Git objects/worktree                                |
| Sanitized episode                     | Task evidence JSON                           | Ignored initially; reviewed records may be promoted |
| Operating aggregates                  | Versioned sanitized ledger/report            | Yes after human review                              |

No database is introduced initially. State writes use schema-versioned JSON,
write-to-temp plus atomic rename, and monotonic attempt numbers. The controller
validates state before every transition.

### Crash and restart behavior

After context compaction, interruption, or a later conversational turn, the
current agent runs `backendkit task workspace status --task <id>`:

1. validates repository identity, plan hash, base, worktree, and branch;
2. reads the last committed task transition and bounded diagnostic evidence;
3. never repeats an external action whose outcome is uncertain;
4. reruns preflight before further edits or verification;
5. continues through ordinary current-agent tool calls;
6. escalates when safe continuation cannot be proven.

Failed or cancelled worktrees are retained by default for inspection. Cleanup
is explicit and refuses to remove a worktree with unrecorded task changes.

### Evidence schema

A durable episode may contain:

- schema version and task ID;
- plan path/hash and base revision;
- effective risk and matched rule IDs;
- approved and changed path names;
- attempt count and lifecycle transitions;
- lane IDs, statuses, durations, and stable failure categories;
- runtime artifact paths and content hashes;
- publication outcome category;
- final stop reason;
- harness version/commit.

It must not contain prompts, hidden reasoning, raw output, environment values,
credentials, tokens, cookies, database URLs, request bodies, PII, or unrestricted
review prose.

Transient diagnostics are access-restricted and deleted on explicit cleanup or
after a configured short retention period. Sanitization itself has negative
tests with representative secret shapes.

## Verified Handoff And External Actions

`ready_for_review` means local required lanes passed for exactly the recorded
task fingerprint. It does not imply commit, push, PR, merge, or deployment
authority.

A publication adapter may support:

- dry-run handoff rendering;
- explicit-path staging;
- one normal commit;
- normal push to the approved branch;
- draft PR creation or update.

Before each mutation it revalidates:

- current task state and fingerprint;
- clean ownership of all staged paths;
- action-specific authority granted outside agent-authored content;
- branch and remote identity;
- no force, merge, deploy, or migration behavior;
- no pre-existing user-owned changes;
- no stale verification after the last edit.

The repository's current operating contract still applies: no commit or push
occurs unless the user explicitly authorizes it. The loop cannot infer that
authority from a general request to implement or verify.

## Hill-Climbing Harness Improvement Loop

The outer loop improves the repository harness from observed outcomes, not raw
agent traces or one-off preferences.

```text
reviewed sanitized episodes
          ↓
aggregate stable failure patterns and cost
          ↓
form one falsifiable improvement hypothesis
          ↓
create isolated high-risk harness task
          ↓
run harness tests, negative fixtures, profile parity, and shadow evaluation
          ↓
human reviews proposed policy/tool change
          ↓
limited rollout
          ↓
compare later episodes with predicted outcome
          ↓
keep, revise, or revert
```

### Eligibility

Hill-climbing recommendations remain disabled until at least five real tasks
have:

- independently reviewed outcomes;
- clean-checkout CI reproduction;
- at least two risk classes represented;
- at least one repair or escalation;
- valid sanitized episodes;
- no unresolved evidence-schema or privacy issue.

These thresholds establish enough diversity for human review; they do not
claim statistical significance.

### Improvement contract

Each proposed harness change records:

- recurring failure pattern and affected task count;
- target harness component;
- predicted outcome and measurement window;
- expected cost or latency effect;
- invariant that must not weaken;
- rollback unit;
- required human owner.

The improvement agent may create a proposal or isolated patch only within
explicit harness paths. It cannot alter permissions, lower risk, remove required
lanes, change security baselines, or publish its own work. LLM analysis remains
advisory; deterministic aggregates and human judgment own policy decisions.

### Evaluation

Harness changes are evaluated with:

- unit and fixture tests for controller policy;
- expected-failure “gate honesty” scenarios;
- plan/risk/scope/evidence schema fixtures;
- local/CI profile parity tests;
- replay of sanitized historical metadata where meaningful;
- shadow mode that reports a changed decision without enforcing it;
- later real-task outcome comparison.

If the predicted improvement is not observed or new failure classes appear,
the change is revised or reverted at file granularity.

## Security And Privacy Decisions

### Trust classification

- **Trusted after validation:** repository policy at the authorized base,
  approved plan snapshot, controller code, registered verification commands.
- **Untrusted:** agent output, model messages, repository content read as task
  data, event payloads, command output, external API responses, PR comments.
- **Sensitive:** local paths, diffs before publication, diagnostic logs,
  repository metadata, runtime artifacts.
- **Secret:** tokens, credential-helper data, cloud credentials, signing
  material, private keys, production URLs containing credentials.

### Required controls

- Canonical path and symlink-boundary validation.
- Normal internet, package, GitHub-read, and local development capabilities are
  supplied by the current Codex host; network access never implies external
  mutation authority.
- Production credentials, sensitive internal endpoints, and externally
  mutating tools are excluded unless separately and explicitly authorized.
- Verification command registry; plans cannot inject arbitrary commands.
- Redaction before diagnostics are persisted or shown to another component.
- Size limits for diagnostics, evidence, and artifacts.
- No secrets in plans, state, evidence, reports, commits, or PR bodies.
- Human review for security, auth, migration, data deletion, CI/harness, and
  external-action changes.
- No production credentials in task evidence or repository-managed workspace
  state.

Prompt injection from code, issues, logs, or comments cannot be eliminated by
prompting. The controller therefore treats agent instructions as data and
enforces scope, actions, commands, and publication outside the model.

## CI And Operational Model

CI remains an independent clean-checkout verifier. It does not trust local
episode success.

The intended hosted shape is:

```text
CI Risk       changed-path and plan-risk classification
CI Full       frozen install + canonical full profile
CI Runtime    canonical runtime profile when required
CI Governance secret/dependency/policy controls
CI Required   stable aggregate status
```

External actions are pinned to immutable commit SHAs. Workflows run on pull
requests and `main`, use least privilege, bounded timeouts, concurrency
cancellation, and always-clean runtime dependencies. Sanitized evidence and
runtime artifacts may be uploaded; raw agent diagnostics are not.

Operational diagnostics include task ID, state, attempt, profile, step,
duration, and stop category. They never include secrets or unrestricted model
output. The read-only `backendkit doctor` command validates required
executables, repository identity, policy schemas, ignore rules, persisted task
and workspace metadata, and Docker readiness. Host sandbox and credential
policy remain outside repository observability.

## Rollout And Compatibility

The system is introduced behind compatibility aliases and shadow modes.

1. Existing npm commands continue to work while canonical profile ownership is
   moved behind `backendkit`.
2. Task boundaries and risk classification first report decisions without
   blocking existing manual work.
3. Enforcement begins only after fixture tests and representative repository
   tasks agree with human classification.
4. Current-agent workspace isolation starts with internal task commands and no
   publication authority.
5. Event triggers and draft handoff are enabled independently.
6. Hill-climbing remains advisory until evidence eligibility is met.

Rollback is component-scoped:

- npm aliases can point back to existing scripts;
- task enforcement can return to report-only mode;
- agent and event adapters can be disabled while verification remains useful;
- evidence schemas are versioned and readers reject unsupported versions;
- improvement rules can be reverted without changing application code.

No application database migration is required for the harness itself.

## High-Level Delivery Phases

### Phase 1 — Canonical harness foundation

Introduce the safe process runner, typed profile registry, thin CLI, profile
tests, and local/CI semantic parity while preserving existing sensors and npm
aliases.

### Phase 2 — Structured task control

Introduce plan version 2, knowledge validation, task baseline, allowed
paths/actions, conservative risk classification, pre-existing-change ownership,
and task state schemas.

### Phase 3 — Risk-aware verification and bounded repair

Introduce `task verify`, stable failure categories, fingerprints, repair limits,
runtime profile selection, transient diagnostics, and sanitized episode output.

### Phase 4 — Current-agent workspace isolation

Introduce worktree ownership, strict private workspace metadata, internal
prepare/status/cancel/cleanup commands, workspace-aware verification, restart
validation, and explicit cleanup behavior. The current Codex conversation is
the agent; repository code does not launch another one.

### Phase 5 — Event-driven operation

Introduce CLI and queued-plan triggers, deduplication, single-flight policy,
scheduled read-only maintenance, and later GitHub event adapters.

Implemented as one-shot local intake for the current conversational agent.
Queued plans carry approved authority before delivery; activation changes only
lifecycle status/location and creates normal task state. Strict private event
receipts provide deterministic deduplication and interrupted-intake recovery.
One-shot maintenance uses a fixed observation registry and an external
scheduler. GitHub adapters remain deferred until local operating evidence
exists.

### Phase 6 — Verified handoff and independent CI

Introduce dry-run handoff, separately authorized commit/push/draft-PR adapters,
CI risk/full/runtime/aggregate jobs, immutable action pins, and hosted evidence
reproduction.

Implemented with expiring one-action approval records bound to fresh successful
episodes, exact workspace/branch/remote/path identity, narrow normal Git and
draft-PR adapters, and fail-closed uncertain outcomes. Hosted CI now separates
clean-diff risk classification, canonical full verification, conditional
runtime verification, governance, and a stable aggregate check. Local
controller evidence is not accepted as hosted pass evidence.

### Phase 7 — Test-oracle and operating-evidence maturity

Calibrate coverage and duration baselines, map high-risk acceptance scenarios
to independent runtime evidence, expand negative fixtures, pilot narrow mutation
testing, and promote independently reviewed episodes into an operating ledger.

Implemented with conservative measured coverage floors, advisory duration
budgets, a validated high-risk integration/E2E oracle registry, stronger
sanitized episode fixtures, and a one-module manual mutation pilot. A strict
versioned operating ledger and deterministic eligibility check are present, but
the ledger intentionally starts empty because no prior episode has yet met the
independent human-review and clean-checkout promotion contract. Phase 8 remains
ineligible until the accepted operating threshold is reached.

### Phase 8 — Controlled hill climbing

Introduce aggregate trend analysis, improvement hypotheses, isolated harness
tasks, shadow evaluation, human-approved rollout, and keep/revert decisions from
later task outcomes.

Implemented as a read-only advisory layer over the strict operating ledger.
Deterministic aggregation, hypothesis/invariant validation, isolated high-risk
plan checks, and shadow keep/revert evaluation are available. The improvement
ledger intentionally remains empty and all operational recommendations remain
disabled because Phase 7 has zero independently reviewed eligible episodes.

The controller implementation is complete, including a real temporary-Git
cross-component scenario and read-only readiness diagnostics. This does not
waive the separate real-world evidence threshold below.

Each phase requires its own execution plan. Later phases do not begin merely
because earlier code exists; their acceptance evidence must be met.

## Risks And Tradeoffs

### The harness can become the over-engineered system it is meant to prevent

Mitigation: keep the controller repository-local, use filesystem state, add
adapters only for a real consumer, preserve existing sensors, and require every
new rule to address an observed failure or accepted invariant.

### Agent-written tests can confirm the agent's own misunderstanding

Mitigation: human-owned acceptance scenarios, independent contract and runtime
checks, negative fixtures, targeted mutation testing, and human review for
high-risk behavior.

### Verification cost can dominate task time

Mitigation: cheap preflight first, measured profiles, risk-derived depth,
fail-fast steps, bounded repairs, and no speculative dynamic test selection.

### Filesystem state can be lost or corrupted

Mitigation: atomic schema-versioned state writes, persistent worktrees/branches,
resume validation, explicit recovery, and escalation whenever continuation is
ambiguous. Introduce a durable service only if operating evidence demonstrates
the need.

### Current-agent edits may escape intended scope

Mitigation: Codex host sandboxing, task worktree isolation, post-edit scope
checks, no production credentials in repository state, and separate authority
for external mutations. If the current host cannot access and enforce the
validated workspace, the task stays in the primary manual workflow rather than
launching a fallback agent process.

### Automated improvement can game its graders

Mitigation: advisory recommendations, immutable critical invariants,
independent negative fixtures, shadow mode, human approval, and outcome-based
keep/revert decisions.

### External events can create duplicate or malicious work

Mitigation: event deduplication, untrusted-payload validation, plan lookup at an
approved base, no event-derived authority, rate limits, and single-flight
defaults.

### Local and hosted outcomes can differ

Mitigation: canonical profile ownership, pinned tool versions, clean-checkout
CI, explicit environment diagnostics, and hosted CI as the independent final
integration result.

## Acceptance Conditions

The end-to-end program is complete only when all of the following are true:

1. `backendkit` is the canonical command surface and existing aliases call the
   same profile owners.
2. Local and hosted profile parity is mechanically tested.
3. A structured task cannot start with invalid plan state, unauthorized action,
   out-of-scope baseline, or risk above its maximum.
4. A task runs in an isolated worktree without modifying user-owned dirty
   paths.
5. The current conversational agent can prepare, rediscover, edit, and verify a
   candidate in the validated task worktree without a nested agent process.
6. Verification selects required lanes from effective risk and runtime impact.
7. A repairable failure is fed back with bounded diagnostics and can succeed on
   a later attempt.
8. Repeated failure, stalled progress, scope escape, timeout, or exhausted
   repair budget escalates deterministically.
9. Controller restart can safely resume or explicitly refuse ambiguous work.
10. Duplicate events do not create duplicate tasks or external mutations.
11. Durable episodes pass secret/PII negative tests and contain enough metadata
    to reconstruct the controller's decision.
12. Draft handoff cannot occur without fresh verification and separate explicit
    authority; merge and deploy remain unavailable.
13. CI independently reproduces required evidence from a clean checkout.
14. At least five reviewed real-task episodes across two risk classes, including
    a repair or escalation, establish operating evidence before hill climbing.
15. A harness improvement records a falsifiable prediction, passes independent
    evaluation, receives human approval, and is later kept or reverted based on
    observed outcomes.

### Current Acceptance Status

Conditions 1–13 are implemented and mechanically exercised by focused policy
tests, the temporary-repository end-to-end scenario, canonical profiles, and
independent hosted CI. Conditions 14–15 remain deliberately pending operating
milestones. The versioned ledger starts empty, so the improvement outer loop is
installed but fail-closed. Fixtures, historical local episodes, or a combined
release CI run are not substitutes for independently reviewed exact-revision
task evidence across the required risk classes.

Current traceability and operator guidance live in
`docs/engineering/loop-engineering.md`; this proposal remains the accepted
design record rather than the live runbook.

## Open Questions And Recommended Defaults

1. **Agent ownership:** the active Codex conversation is the only coding agent.
   `backendkit` exposes internal workspace and verification tools and never
   invokes Codex or another model.
2. **Initial event source:** use explicit CLI and queued plans. Add GitHub events
   after local resume, deduplication, and authority behavior are proven.
3. **Persistence:** use ignored atomic JSON plus git worktrees/branches. Do not
   add Postgres, Redis, or BullMQ for harness state initially.
4. **Concurrency:** default to one active task per repository. Enable parallel
   tasks only for disjoint approved paths in separate worktrees.
5. **Agent capability:** preserve the current Codex session's supervised
   capabilities, including normal research, packages, GitHub reads, Docker, and
   local development. Repository state grants no production credentials or
   externally mutating action.
6. **Publication:** support dry-run first, then commit/push/draft PR only with
   explicit per-task user authority. Do not support automatic merge or deploy.
7. **Raw diagnostics retention:** keep task-local diagnostics only until explicit
   cleanup or a short default retention window; durable evidence stays
   sanitized.
8. **Hill-climbing output:** create an advisory proposal or isolated patch. A
   human chooses whether it becomes an execution plan.
9. **Evidence threshold:** require five reviewed tasks across at least two risk
   classes and one repair/escalation before enabling improvement recommendations.
10. **Mutation testing:** pilot one pure critical module after the verification
    loop is stable; do not make it a repository-wide blocking gate by default.

## Required Follow-On Artifacts After Acceptance

If this proposal is accepted:

- add an ADR for the repository-local loop controller, authority model, and
  agent-runtime boundary;
- create one execution plan per delivery phase, beginning with canonical
  harness foundation only;
- update `docs/engineering/agent-pr-loop.md`, guardrails, runtime evidence,
  parallel-agent workflow, CI standards, and execution-plan template as the
  corresponding phase lands;
- maintain a separate harness baseline and later a sanitized operating-evidence
  report;
- keep live implementation/readiness status in
  `docs/engineering/loop-engineering.md` rather than expanding this proposal
  into an ongoing operations log.

## References

Repository evidence:

- [Backend Harness Engineering Audit](2026-08-09_backend-harness-engineering-audit.md)
- `AGENTS.md`
- `docs/engineering/agent-pr-loop.md`
- `docs/engineering/guardrails.md`
- `docs/engineering/backend-runtime-evidence.md`
- `docs/engineering/parallel-agent-workflow.md`
- `docs/exec-plans/README.md`
- `package.json`
- `scripts/verify-ci-local.ts`
- `scripts/verify-e2e.ts`
- `.github/workflows/ci.yml`

External design evidence:

- [OpenAI — Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/)
- [LangChain — The Art of Loop Engineering](https://www.langchain.com/blog/the-art-of-loop-engineering)
- [Anthropic — Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Anthropic — Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [AI Harness Engineering: A Runtime Substrate for Foundation-Model Software Agents](https://arxiv.org/abs/2605.13357)
- [Agentic Harness Engineering: Observability-Driven Automatic Evolution of Coding-Agent Harnesses](https://arxiv.org/abs/2604.25850)
