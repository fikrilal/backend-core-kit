# Backend Harness Engineering Audit

**Date:** 2026-08-09

**Status:** exploratory audit; no implementation decision is implied

**Repositories reviewed:**

- `backend-core-kit` — target repository
- `lamara-frontend` — newer task-loop reference
- `mobile-core-kit` — repository-local CLI reference

## Executive Summary

The backend harness is strong at **individual quality sensors** and weak at the
**control loop that selects, runs, records, and learns from those sensors**.

It already has more useful backend-specific guardrails than many production
repositories: strict TypeScript, dependency-cruiser boundaries, OpenAPI drift
and lint checks, Prisma and env drift checks, scaffold smoke tests, architecture
smell baselines, duplication review, real Postgres/Redis/MinIO lanes, secret
scanning, and a detailed PR template. Replacing these would be wasteful.

The missing layer is a small task control plane:

```text
intent and authority
        ↓
changed-path and risk preflight
        ↓
selected deterministic verification lanes
        ↓
sanitized task evidence and failure category
        ↓
human review / repair / later harness improvement
```

Today, most of that loop exists only as prose in `AGENTS.md`, execution plans,
and reviewer expectations. `npm run verify`, `npm run verify:ci-local`, and CI
also describe different pipelines. The harness can detect many defects, but it
cannot yet prove that an agent stayed in scope, had authority for an action,
selected the correct verification depth, or made progress after a failed run.

The recommended direction is:

1. Make the existing checks truthful and testable behind one canonical runner.
2. Add machine-readable task boundaries, risk, and repair limits.
3. Expose the workflow through a thin repository-local `backendkit` CLI.
4. Record sanitized task episodes and stable failure categories.
5. Add recurring or self-improving loops only after real task evidence exists.

Do **not** port the frontend harness wholesale and do **not** reproduce the
mobile CLI's full size. Reuse their decisions, not their accumulated code.

## What “Harness” Means In This Audit

The harness is not only CI and tests. It is the repository-owned system that
helps an agent:

- understand current intent and architecture;
- know what it may read, edit, verify, or publish;
- make small progress without overwriting user work;
- receive fast, attributable feedback;
- prove completion with evidence stronger than a success claim;
- leave durable state for the next session or agent;
- turn repeated failures into better tools or rules.

This definition separates four layers that are currently easy to conflate:

| Layer         | Question                                                       | Backend today                                    |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| Knowledge     | What is true and where is the source of truth?                 | Strong documentation map; partial drift checking |
| Sensors       | Is a specific invariant currently satisfied?                   | Strong and backend-specific                      |
| Task control  | Is this change authorized, scoped, and verified appropriately? | Mostly manual                                    |
| Learning loop | Which recurring failures should change the harness?            | Policy exists; evidence loop does not            |

## Current Backend Harness Map

### Knowledge and intent

- `AGENTS.md` is a concise map to architecture, standards, ADRs, runtime
  evidence, guardrails, parallel work, and execution plans.
- `docs/README.md` is the documentation index.
- `docs/exec-plans/` records non-trivial work and technical debt.
- `docs/engineering/agent-pr-loop.md` defines the intended delivery loop.
- `docs/engineering/guardrails.md` documents enforcement ownership.
- `docs/engineering/parallel-agent-workflow.md` recommends isolated worktrees.

This already follows the useful “map, not encyclopedia” model. The weakness is
not document structure; it is that only a small subset of document state is
machine-validated.

### Static and structural sensors

- Prettier, ESLint, strict TypeScript, and Jest.
- Dependency direction and cycle enforcement through
  `.dependency-cruiser.cjs`.
- Repository-specific architecture findings through
  `scripts/architecture-smells.ts` and a reviewed baseline.
- OpenAPI generation drift and Spectral linting.
- Environment example/schema verification.
- Prisma validation and generated-client drift detection.
- Generated feature smoke testing.
- Core and small-helper duplication reports with reviewed allowlists.
- “Gate honesty” negative checks that prove selected gates reject bad fixtures.

### Runtime and delivery sensors

- Integration and E2E Jest lanes backed by Postgres, Redis, and MinIO.
- `scripts/verify-e2e.ts` owns local dependency lifecycle.
- GitHub Actions runs static checks, starts real dependencies, deploys
  migrations, and runs integration/E2E tests.
- Governance workflow performs secret scanning.
- PR template asks for risk, impact areas, runtime evidence, rollback, and exact
  commands.

### Current command surfaces

The public surface is split among:

- 28+ `package.json` scripts;
- 11 TypeScript files under `scripts/`;
- `tools/scaffold-feature.ts` plus JSON baselines and allowlists;
- duplicated orchestration in `.github/workflows/ci.yml`;
- prose that tells an agent which combination to choose.

The scripts themselves contain roughly 3,400 lines, excluding config and docs.
Two valuable tools are already large enough to deserve explicit ownership:
`scripts/architecture-smells.ts` is about 940 lines and
`scripts/filter-duplication-report.ts` is about 628 lines.

## What Is Already Good And Should Be Preserved

### 1. Backend-specific gates have high leverage

OpenAPI drift, Prisma drift, env/schema drift, dependency boundaries, queue and
runtime tests, and architecture smells address real backend failure modes. A
generic agent framework would not replace them.

### 2. Architecture is mechanically constrained

The repository does not rely only on written layering rules. Dependency
Cruiser currently validates 282 modules and 742 dependencies without a
violation. This is exactly the type of invariant agents need: strict at the
boundary and flexible inside it.

### 3. Negative gate testing has started

`scripts/gates-honesty.ts` is an important idea. A green gate is meaningful
only if representative bad changes make it red. This should grow into tested
sensor contracts rather than be removed.

### 4. Runtime evidence is treated as distinct from static correctness

The runtime-evidence guide correctly calls for HTTP, queue, migration,
observability, and real-service evidence where unit tests cannot establish
behavior. The gap is capture and validation, not policy.

### 5. The repository has an explicit entropy policy

Architecture-smell reports, duplication profiles, scaffolding, and the
“failure appears twice → promote it into the harness” rule are the right
building blocks for garbage collection.

## Findings And Upgrade Opportunities

### F1 — No machine-enforced task boundary or authority model

**Priority: P0**

Execution plans state objectives, risk, constraints, and impact areas, but they
do not define parseable allowed paths, allowed actions, maximum risk, or a
repair budget. Nothing compares the final changed paths with the approved
scope. Nothing distinguishes permission to edit from permission to commit,
push, open a PR, migrate data, or deploy.

Consequences:

- scope discipline depends on agent memory;
- pre-existing dirty files are visible but not formally owned;
- a verification command cannot prove it verified only the intended task;
- repeated failed attempts have no bounded escalation condition;
- plan text documents authority ambiguously instead of constraining execution.

Adopt the frontend V2 plan concepts, simplified for this backend:

```markdown
**Plan version:** 2
**Allowed paths:** libs/features/users/, test/users/
**Allowed actions:** edit, verify
**Maximum risk:** medium
**Repair limit:** 2
```

A plan records human-granted authority; parsing a plan must never create new
authority by itself.

### F2 — Verification pipelines drift and names overstate equivalence

**Priority: P0**

There are three overlapping pipeline definitions:

- `npm run verify` in `package.json`;
- the `STEPS` array in `scripts/verify-ci-local.ts`;
- hand-written steps in `.github/workflows/ci.yml`.

They are not equivalent:

- `verify` omits Prisma drift, project-map drift, scaffold smoke,
  architecture-smell CI, coverage, gate honesty, duplication review, and the
  production dependency audit.
- `verify:ci-local` adds project-map and duplication checks that hosted CI does
  not run.
- hosted CI adds Docker-backed integration/E2E work that `verify:ci-local`
  does not run.
- CI duplicates dependency startup/readiness/migration orchestration already
  implemented by `scripts/verify-e2e.ts`.

The result is semantic drift around “canonical,” “CI mirror,” and “full.” An
agent can run a documented command correctly and still produce weaker evidence
than a reviewer assumes.

Create one typed pipeline registry consumed by the local CLI. CI should invoke
named profiles instead of reimplementing their steps:

```text
fast       deterministic static checks and unit tests
full       fast + expensive static sensors + coverage/build
runtime    real dependencies + migrations + integration/E2E
ci         full + runtime, from a clean checkout
```

Keep duplication as an explicit self-review/report lane until its signal is
calibrated; do not silently make every small task pay for it.

### F3 — Harness code is largely untested as software

**Priority: P0**

The backend has expected-failure checks, but the orchestration and parsers are
mostly executable scripts with top-level side effects. There are no focused
unit suites for pipeline selection, process failures, cleanup behavior,
argument parsing, plan parsing, risk classification, or sanitized evidence.

This is a reliability inversion: application behavior is tested, while the
program deciding whether application behavior is trustworthy has much weaker
tests.

Refactor only the orchestration seam:

- pure command/profile definitions;
- one injectable process runner;
- stable typed outcomes;
- thin CLI adapters;
- fixture tests for pass, fail, signal, timeout, cleanup, and malformed input.

Do not unit-test shell syntax line by line. Test policy and observable command
selection.

### F4 — No automatic risk classification or lane selection

**Priority: P1**

Risk is selected manually in plans and PRs. The repository knows which areas
are sensitive, but changed paths are not classified. A task can accidentally
touch auth, migrations, CI, queue contracts, or dependencies without its
declared risk or verification depth rising.

Add a conservative changed-path classifier. Automation may raise risk but must
never lower a human declaration.

Suggested initial policy:

| Minimum risk | Examples                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| High         | auth/session/RBAC, Prisma schema/migrations, data deletion, queue idempotency/contracts, CI/harness, dependencies, secrets/security |
| Medium       | application behavior, controllers/DTOs/OpenAPI, repositories, workers, storage/email/push/config                                    |
| Low          | narrow docs and metadata with no executable or policy impact                                                                        |

Unknown paths should default to medium. Tests should inherit the risk of the
behavior they claim to validate; changing a critical test is not automatically
low risk.

Risk should initially choose **verification depth**, not merge authority.
Human review remains required for high-risk backend work.

### F5 — Runtime evidence is free-form and not an auditable task episode

**Priority: P1**

The current evidence guide and PR template are useful, but evidence is pasted
manually. There is no durable link among:

- active plan and base revision;
- pre-existing and task-owned paths;
- effective risk and selected lanes;
- commands, durations, and outcomes;
- stable failed boundary;
- repair count;
- runtime artifact paths;
- final handoff state.

Add an ignored per-task state file and optional sanitized JSON summary. It
should record categories and metadata, never command output or environment
values.

Example episode shape:

```json
{
  "schemaVersion": 1,
  "plan": "docs/exec-plans/active/2026-08-09_example.md",
  "baseRevision": "<git-sha>",
  "risk": "high",
  "changedPaths": ["libs/features/auth/..."],
  "lanes": [
    { "id": "full", "status": "passed", "durationMs": 12345 },
    { "id": "runtime", "status": "failed", "failure": "e2e" }
  ],
  "attempt": 1
}
```

Do not store prompts, raw logs, JWTs, request bodies, database URLs, env values,
or review prose. Evidence must make failures attributable without becoming a
new secret store.

### F6 — Knowledge lifecycle checks are incomplete

**Priority: P1**

`verify:project-map` passes and currently checks 107 links/items, but execution
plan lifecycle is not fully enforced. The harness does not prove:

- exactly one active plan for the current task;
- plan status matches its folder;
- completed plans have no unresolved required checklist item;
- required sections and metadata are present;
- plan risk does not exceed authorized maximum risk;
- proposals and standards remain indexed;
- local Markdown links resolve across all knowledge roots.

Add a `knowledge check` command modeled on the frontend implementation, with a
smaller backend-specific schema. This makes repository knowledge executable
without putting more prose into `AGENTS.md`.

### F7 — Tooling is discoverable but scattered

**Priority: P1**

Package scripts are acceptable aliases, but they are a poor control plane.
Related behavior is spread across `scripts/`, `tools/`, JSON files, docs, and
CI. Each script has its own process handling, output conventions, and argument
shape.

Create a thin internal CLI named `backendkit`:

```text
backendkit doctor
backendkit task begin
backendkit task verify
backendkit verify --profile fast|full|runtime|ci
backendkit risk classify
backendkit knowledge check
backendkit scaffold feature <name>
backendkit report duplication
backendkit report architecture
```

Recommended shape:

```text
tools/backendkit/
  cli.ts                 # argument routing only
  process-runner.ts      # one safe child-process boundary
  commands/
  task/
  verification/
  evidence/
```

Keep policy outside the CLI:

- dependency rules stay in `.dependency-cruiser.cjs`;
- smell/duplication baselines stay under `tools/` or a later `harness/` policy
  directory;
- standards stay in `docs/`;
- package scripts remain short aliases for compatibility.

The mobile CLI validates the ownership model, but its roughly 8,500-line scope
includes template customization and mobile runtime concerns. It is a design
reference, not a size target. The backend CLI should begin with task and verify
commands only.

### F8 — CI has avoidable trust and parity gaps

**Priority: P1**

Current strengths are read-only permissions, concurrency cancellation,
timeouts, dependency review, secret scanning, coverage artifact upload, and
real-service tests.

Gaps:

- the main CI workflow runs only on pull requests, not pushes to `main`;
- external actions use mutable major tags rather than immutable commit SHAs;
- there is no stable aggregate required status separating risk, static, and
  runtime outcomes;
- CI and local runtime orchestration are duplicated;
- project-map and duplication policies differ between local CI-like and hosted
  CI runs;
- no machine-readable risk output controls conditional lanes.

Add a stable aggregate job only after pipeline profiles are canonical. Pin
third-party actions to full SHAs with readable version comments. Run CI on pull
requests and `main`. Preserve least privilege. Do not add write permissions or
automatic merge while task evidence is immature.

### F9 — Process execution has an unnecessary shell boundary

**Priority: P1, small fix**

`scripts/verify-e2e.ts` uses `spawn(..., { shell: true })` even though commands
and arguments are already structured arrays. This expands parsing behavior,
complicates cross-platform correctness, and creates an avoidable injection
surface if future arguments become dynamic.

The shared process runner should default to `shell: false`, preserve argument
arrays, redact configured values from errors, and handle signals/timeouts
consistently.

### F10 — Coverage exists as a report, not a calibrated confidence control

**Priority: P2**

CI runs Jest coverage and uploads it, but `jest.config.cjs` defines no coverage
threshold. More importantly, line coverage would not prove that auth, queue,
data-deletion, or contract tests assert the right behavior.

Recommended progression:

1. Capture a coverage and test-inventory baseline without declaring a target.
2. Map high-risk acceptance scenarios to integration/E2E evidence.
3. Add no-regression thresholds only after several stable observations.
4. Expand negative gate fixtures for critical policies.
5. Pilot mutation testing narrowly on one pure, high-risk domain such as token
   rotation or authorization policy; do not add a repository-wide mutation
   gate by default.

This strengthens the oracle rather than optimizing for a percentage.

### F11 — There is no bounded repair loop

**Priority: P2**

An agent can rerun an expensive failing command indefinitely or make unrelated
changes between attempts. Add a task fingerprint from plan identity, changed
paths, and stable metadata. If the same failure category repeats without a
meaningful fingerprint change, count it against the plan's repair limit and
escalate.

This is not automatic source repair. It is a stop condition that protects time,
tokens, and code from unproductive loops.

### F12 — Entropy scans exist, but there is no evidence-driven outer loop

**Priority: P3; deliberately defer**

The repository can generate architecture and duplication reports, but it does
not record which findings recur across real tasks or which harness changes
improved outcomes. Therefore it is not ready for autonomous hill climbing.

After enough sanitized episodes exist, a scheduled read-only job may:

- aggregate failure categories and durations;
- detect recurring scope, contract, migration, or test failures;
- update a quality report;
- propose one narrow harness change with a falsifiable expected outcome.

Any policy, threshold, baseline, permission, or CI change should remain a human
decision. Automatic self-modification before trustworthy evidence would
optimize noise and invite test gaming.

## Comparison With The Two Local References

| Capability                | Backend today                       | `lamara-frontend`                       | `mobile-core-kit`            | Recommendation                                           |
| ------------------------- | ----------------------------------- | --------------------------------------- | ---------------------------- | -------------------------------------------------------- |
| Canonical quality command | Multiple overlapping commands       | Fast/full/runtime profiles              | One CLI verify workflow      | One backend pipeline registry and profiles               |
| Task baseline             | None                                | Captures base, dirty paths, active plan | None                         | Adopt frontend concept                                   |
| Structured task scope     | Prose constraints                   | Allowed paths/actions/risk/repair       | Mostly workflow-level policy | Adopt a smaller V2 schema                                |
| Changed-path risk         | Manual                              | Deterministic classifier                | Manual                       | Add backend path classifier                              |
| Scope verification        | Manual                              | Rejects new out-of-scope paths          | None                         | Adopt frontend concept                                   |
| Bounded repair            | None                                | Fingerprint and repair limit            | None                         | Adopt after task state                                   |
| Evidence                  | PR prose and runtime guide          | Sanitized task and operating evidence   | Runtime artifact workflows   | Combine frontend metadata with backend runtime artifacts |
| Knowledge validation      | Project-map drift                   | Links, indexes, plan lifecycle          | Project-map verification     | Expand backend checker                                   |
| CLI cohesion              | Scattered npm/scripts/tools         | Still scattered under scripts           | Cohesive internal CLI        | Use mobile ownership model, much smaller scope           |
| Harness tests             | Mostly expected-failure integration | Focused unit fixture suites             | CLI and workflow tests       | Add tests around policy seams                            |

The frontend harness is more advanced but also about 5,100 lines across its
harness scripts and core harness docs. Copying it would recreate complexity and
frontend assumptions. Port these ideas only:

- task state;
- structured boundaries;
- conservative risk raising;
- scoped lane selection;
- stable failure categories;
- repair bounds;
- sanitized evidence;
- knowledge lifecycle checks.

The mobile repository demonstrates a cleaner public surface and ownership
boundary. Port these ideas only:

- one repository-local CLI;
- one process runner;
- command-level help and stable exit codes;
- policy outside orchestration code;
- package-script/CI aliases that call the same implementation.

## Current Industry Evidence And Its Meaning Here

### OpenAI: repository legibility and mechanically enforced invariants

OpenAI's February 2026 harness-engineering report describes a short agent map,
structured repository knowledge, strict architectural edges, executable
feedback, and recurring entropy cleanup. Its strongest lesson for this backend
is not “more autonomy”; it is that agent throughput depends on making the
repository legible and enforcing invariants rather than micromanaging local
implementation.

The backend is already strong on architecture sensors and documentation. It is
behind on task state, quality grading over time, and recurring cleanup evidence.

Source: [OpenAI — Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/)

### LangChain: stack loops deliberately

LangChain's June 2026 loop-engineering model distinguishes:

1. the inner agent/tool loop;
2. a verification loop with graders and feedback;
3. event-driven triggers;
4. a hill-climbing loop that changes the inner system from accumulated traces.

The backend has pieces of level 2, CI provides part of level 3, and level 4 is
not supported by evidence yet. The correct next move is to complete the
verification loop, not install a self-improving agent.

Source: [LangChain — The Art of Loop Engineering](https://www.langchain.com/blog/the-art-of-loop-engineering)

### Anthropic: incremental progress and durable state across contexts

Anthropic's long-running-agent work reports two common failures: attempting too
much in one session and later sessions declaring completion from incomplete
state. Their remedy is explicit feature/task state, incremental work, a clean
starting check, and artifacts that survive context changes.

For this backend, execution plans are the right durable artifact, but they need
parseable scope, status, and evidence to prevent the same failure modes.

Sources:

- [Anthropic — Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Anthropic — Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)

### Emerging research: observe components, experiences, and decisions

Two 2026 preprints formalize useful ideas but should not be treated as settled
standards:

- An AI harness has responsibilities beyond verification: task specification,
  context, tools, memory, task state, observability, failure attribution,
  permissions, entropy auditing, and intervention records.
- A self-improving harness needs explicit editable components, distilled task
  evidence rather than raw traces, and predictions that can be checked against
  later outcomes.

These support the proposed episode format and falsifiable harness changes. They
do not justify autonomous policy mutation in this repository.

Sources:

- [AI Harness Engineering: A Runtime Substrate for Foundation-Model Software Agents](https://arxiv.org/abs/2605.13357)
- [Agentic Harness Engineering: Observability-Driven Automatic Evolution of Coding-Agent Harnesses](https://arxiv.org/abs/2604.25850)

### Robert C. Martin: shift human attention toward constraints and acceptance

Martin's July 2026 discussion argues for surrounding agents with strict
complexity and coverage constraints and putting more human attention on
acceptance behavior and QA procedures than on reading every implementation
line. He also publicly cautioned that stacking every possible test layer can be
overkill; criticality should determine depth.

That direction is useful, but “do not review code” is **not** an appropriate
backend policy yet:

- agent-written implementation and agent-written tests can share the same
  mistaken assumption;
- current coverage has no calibrated threshold and coverage is not an oracle;
- auth, persistence, deletion, queues, and migrations remain high consequence;
- the backend lacks task-scope enforcement and task episode evidence;
- high-risk changes explicitly require human review in current project policy.

The practical adaptation is: humans own acceptance criteria, risk, architecture
invariants, and critical runtime evidence; agents may produce implementation
and tests; independent gates interrogate both. Human review can become more
targeted as the gauntlet earns trust from real outcomes.

The main thread was not reliably indexable directly during this audit, so the
summary is attributed through a contemporaneous secondary account rather than
presented as a verified verbatim transcript. A related test-overload post is
directly linkable.

Sources:

- [Secondary account of Martin's July 2026 agent-testing thread](https://www.explainx.ai/blog/uncle-bob-ai-coding-gauntlet-tests-not-reviews-july-2026)
- [Martin's test-overload reconsideration post on X](https://x.com/unclebobmartin/status/2072736888478175413)

## Recommended Target Architecture

```text
AGENTS.md + docs + execution plan
                │
                ▼
        backendkit task begin
      base + pre-existing paths + plan
                │
                ▼
        backendkit task verify
  changed paths → scope → risk → profile
                │
     ┌──────────┼───────────┐
     ▼          ▼           ▼
   fast        full       runtime
 static/unit   expensive   services/e2e
     └──────────┼───────────┘
                ▼
   sanitized episode + artifacts
                │
       ┌────────┴────────┐
       ▼                 ▼
 human handoff      aggregate trends
                         │
                         ▼
             proposed harness improvement
                 (human-approved)
```

### Ownership boundaries

```text
tools/backendkit/             orchestration and task state
scripts/ or harness/sensors/  backend-specific deterministic sensors
tools/*.json                  baselines and reviewed policy data
docs/                         intent, standards, and evidence contracts
.github/workflows/            hosted trigger/setup; calls backendkit profiles
test-results/ or .tmp/        ignored task state and local evidence
_artifacts/                   ignored runtime artifacts
```

The CLI should orchestrate existing owners, not absorb OpenAPI, Prisma,
dependency, duplication, or architecture policy into one giant module.

## Proposed Implementation Sequence

### Phase 0 — Baseline and truth alignment

**Goal:** remove ambiguity before adding features.

- Measure durations and outcomes for current `verify`, `verify:ci-local`, and
  `verify:e2e` on representative machines.
- Document exact current lane contents.
- Extract a typed command runner with `shell: false` by default.
- Create one pipeline registry and make package scripts call it.
- Make hosted CI call the same full/runtime profiles.
- Add focused tests for pipeline selection, failure propagation, timeout, and
  dependency cleanup.
- Keep existing commands as compatibility aliases.

**Exit condition:** one named profile has the same semantics locally and in CI.

### Phase 1 — Task state, boundaries, and risk

**Goal:** make every non-trivial agent task bounded and reproducible.

- Introduce execution-plan schema version 2.
- Parse allowed paths/actions, maximum risk, and repair limit.
- Add `backendkit task begin` to capture base revision and pre-existing paths.
- Add conservative changed-path risk classification.
- Add preflight that rejects out-of-scope paths and risk above authorization.
- Add knowledge lifecycle checks and fixture tests.

**Exit condition:** verification fails before expensive work when scope,
authority, plan lifecycle, or risk is invalid.

### Phase 2 — Risk-aware verification and evidence

**Goal:** make successful verification attributable.

- Add `backendkit task verify`.
- Route low risk to fast, medium/high to full, and runtime-sensitive work to the
  runtime profile based on declared impact plus raised path risk.
- Write ignored task state and optional sanitized JSON summaries.
- Categorize failures (`preflight`, `format`, `lint`, `types`, `unit`,
  `contract`, `prisma`, `migration`, `integration`, `e2e`, `security`, etc.).
- Enforce repair fingerprints and limits.
- Add runtime artifact adapters for HTTP/queue/migration evidence only where
  they provide real value.

**Exit condition:** a reviewer can reconstruct why a task passed or stopped
without reading raw terminal history.

### Phase 3 — CI hardening and controlled handoff

**Goal:** reproduce evidence independently and keep external actions explicit.

- Pin actions to immutable SHAs.
- Run on PRs and `main`.
- Split risk, static, runtime, and aggregate status while preserving bounded
  timeouts and least privilege.
- Upload sanitized task summaries and required runtime artifacts.
- Consider a dry-run handoff command only after task-path ownership is proven.
- Keep commit, push, PR, merge, migration, and deployment authority separate.

**Exit condition:** hosted CI reproduces the same policy from a clean checkout
and exposes one stable required status.

### Phase 4 — Test-oracle strengthening

**Goal:** increase confidence without test-count or coverage theater.

- Baseline coverage and suite durations.
- Map high-risk acceptance scenarios to independent integration/E2E evidence.
- Add representative negative fixtures for auth, problem details, OpenAPI,
  migration, and queue invariants.
- Pilot mutation testing on one pure critical module.
- Add thresholds only after evidence supports them.

**Exit condition:** at least one critical feature has a tested chain from human
acceptance scenario to independent runtime evidence.

### Phase 5 — Evidence-driven outer loop

**Goal:** improve the harness from observed failures, not fashion.

- Record a small number of independently reviewed task episodes across at
  least two risk classes, including one repair or escalation.
- Aggregate stable categories and durations; never raw prompts or logs.
- Schedule read-only architecture, duplication, and knowledge scans.
- Require every proposed harness change to state an expected measurable effect.
- Compare later task outcomes and revert ineffective policy changes.

**Exit condition:** a human can decide whether a recurring finding deserves a
new rule using task evidence rather than anecdotes.

## What Not To Build Yet

- No autonomous merge or deployment.
- No agent that edits its own permissions, risk rules, baselines, or CI policy.
- No multi-agent reviewer mesh by default.
- No semantic LLM judge in the blocking path while deterministic sensors cover
  the requirement.
- No blanket mutation-testing or 100% coverage mandate.
- No dynamic test-selection system that risks skipping critical backend tests.
- No database of raw prompts, traces, environment variables, or command output.
- No giant `backendkit` module that moves existing script sprawl into one file.
- No deletion of package-script aliases until the CLI has operating evidence.

## Suggested Success Measures

Measure outcomes, not harness size:

- percentage of non-trivial tasks with a valid structured plan;
- percentage rejected at preflight before an expensive invalid run;
- scope-violation count;
- first-pass verification rate by risk class;
- repair attempts and stable failure category;
- median fast/full/runtime duration;
- CI/local semantic mismatch count;
- cleanup success after failed runtime lanes;
- repeated failure categories promoted into a sensor;
- harness changes whose predicted improvement was later observed;
- high-risk acceptance scenarios with independent runtime evidence.

Do not optimize for number of tests, number of rules, amount of generated code,
or agent autonomy level.

## Local Audit Evidence

Read-only checks executed during this audit:

```text
npm run verify:project-map
  passed; 5 documented layout paths and 107 links/items checked

npm run verify:gates
  passed; selected expected-failure gate fixtures were rejected

npm run verify:env
  passed; env.example and runtime schema were consistent under current policy

npm run deps:check
  passed; 282 modules and 742 dependencies, no violations
```

No full unit, coverage, Docker-backed E2E, duplication-report, dependency-audit,
or CI run was executed for this documentation-only audit. In particular,
duplication commands were not run because they write generated `_WIP/` reports
and the request did not require regenerating those artifacts.

## Final Recommendation

Approve Phases 0–2 as the next harness program. Treat Phases 3–5 as gated by
evidence from the earlier phases.

The first implementation should be intentionally small:

1. a shared safe process runner;
2. one canonical verification-profile registry;
3. a thin `backendkit verify --profile ...` command;
4. focused tests proving profile selection and failure behavior;
5. compatibility aliases from the existing npm scripts.

That first slice removes current pipeline drift and establishes the seam needed
for task boundaries, risk, and evidence without prematurely importing the
frontend harness's full complexity.
