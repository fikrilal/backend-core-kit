# Progressive Feature Architecture Foundation

Date: 2026-08-08  
Owner: Codex  
Status: completed  
Risk class: medium  
Related issue/PR: N/A

## Objective

Implement the first foundation batch for ADR 0018: update normative docs,
dependency boundary rules, and scaffold tooling so new features default to the
progressive endpoint-slice shape while retaining the clean/hexagonal scaffold as
an explicit option.

## Constraints

- Architecture constraints:
  - preserve `apps/`, `libs/platform/`, `libs/features/`, and `libs/shared/`;
  - preserve platform-not-importing-features and shared framework-free rules;
  - enforce `domain` and `app` purity when those folders exist;
  - keep clean/hexagonal feature structure available for high-risk work.
- Product/runtime constraints:
  - no public API behavior change;
  - no auth/session/RBAC behavior change;
  - no Prisma schema or migration change.
- Out of scope:
  - auth capability split;
  - shared endpoint/error primitive implementation;
  - proving-slice feature migration;
  - commits or pushes.

## Impact Areas

- API/OpenAPI: no
- DB/Prisma/migrations: no
- Auth/session/RBAC: no
- Queue/jobs: no runtime behavior; scaffold only
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: no
- CI/release/harness: yes

## Acceptance Criteria

1. Normative docs describe progressive feature tiers and promotion triggers.
2. Dependency-cruiser permits simple feature folders while preserving core
   forbidden dependencies.
3. `npm run scaffold:feature -- --name <feature>` generates a simple
   endpoint-slice feature.
4. `npm run scaffold:feature -- --name <feature> --tier clean` generates the
   prior clean/hexagonal-style scaffold.
5. Scaffold smoke validates both simple and clean scaffolds.
6. Targeted verification commands pass or failures are documented.

## Implementation Checklist

- [x] Update architecture and guide docs.
- [x] Update dependency-cruiser rules.
- [x] Update scaffold feature CLI and templates.
- [x] Update scaffold smoke script.
- [x] Run targeted verification.

## Decision Log

- 2026-08-08: Start with docs/boundaries/scaffold instead of auth -> reduces
  risk and makes the new path executable before moving security-sensitive code.
- 2026-08-08: Keep clean scaffold under explicit `--tier clean` -> preserves the
  high-risk feature path while changing the default.

## Verification

Commands to run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run deps:check
npm run scaffold:smoke
npm run verify:project-map
```

Outcomes:

- `npm run scaffold:feature -- --name sample-simple --dry-run`: passed.
- `npm run scaffold:feature -- --name sample-clean --tier clean --with-queue --dry-run`: passed.
- `npm run scaffold:smoke`: passed. Generated temporary simple and clean features with queues, ran lint/typecheck/deps, then cleaned generated files.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run deps:check`: passed.
- `npm run verify:project-map`: passed.

## Runtime Evidence

Not required for this batch. The changes affect docs, static boundary rules, and
generated scaffold output only.

## Risks And Mitigations

- Risk: dependency rules become too permissive.
  - Mitigation: keep explicit platform/shared/domain/app/app-process forbidden
    imports and run `npm run deps:check`.
- Risk: scaffold generates code that compiles but violates project conventions.
  - Mitigation: scaffold smoke runs lint, typecheck, and dependency checks for
    generated simple and clean features.
- Risk: docs and scaffold disagree.
  - Mitigation: update docs and scaffold together in this batch.

## Completion Notes

Implemented the foundation batch for ADR 0018:

- docs now describe progressive feature tiers and promotion triggers;
- dependency-cruiser rules now allow simple feature slices while enforcing
  stricter `domain`/`app` boundaries when those folders exist;
- `scaffold:feature` now defaults to a simple endpoint-slice scaffold;
- `scaffold:feature -- --tier clean` retains an explicit clean/hexagonal path;
- scaffold smoke validates both simple and clean scaffolds.

## Follow-Ups

- [ ] Add shared endpoint/error primitives.
- [ ] Prove the new structure on one small non-auth slice.
- [ ] Split auth by capability after the proving slice passes verification.
