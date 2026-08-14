import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseOperatingLedger } from '../evidence/operating-ledger';
import {
  evaluateShadow,
  parseImprovementLedger,
  validateImprovementProgram,
} from './improvement-ledger';
import { eligibleEvidence, improvementHypothesis } from './improvement-fixtures';

describe('controlled harness improvement ledger', () => {
  it('accepts only an empty program while operating evidence is ineligible', async () => {
    const evidence = parseOperatingLedger({ schemaVersion: 1, entries: [] });
    const empty = parseImprovementLedger({ schemaVersion: 1, hypotheses: [] });
    await expect(validateImprovementProgram('/repo', evidence, empty)).resolves.toBeUndefined();

    const proposed = parseImprovementLedger({
      schemaVersion: 1,
      hypotheses: [improvementHypothesis('proposed')],
    });
    await expect(validateImprovementProgram('/repo', evidence, proposed)).rejects.toThrow(
      'disabled until evidence is eligible',
    );
  });

  it('rejects agent ownership, incomplete invariants, and unsafe rollback paths', () => {
    const base = improvementHypothesis('proposed');
    expect(() =>
      parseImprovementLedger({
        schemaVersion: 1,
        hypotheses: [{ ...base, ownerId: 'agent:codex' }],
      }),
    ).toThrow('schema version 1');
    expect(() =>
      parseImprovementLedger({
        schemaVersion: 1,
        hypotheses: [{ ...base, invariants: ['risk.no-lowering'] }],
      }),
    ).toThrow('schema version 1');
    expect(() =>
      parseImprovementLedger({
        schemaVersion: 1,
        hypotheses: [{ ...base, rollbackPaths: ['libs/features/auth/service.ts'] }],
      }),
    ).toThrow('schema version 1');
    expect(() =>
      parseImprovementLedger({
        schemaVersion: 1,
        hypotheses: [{ ...base, rollbackPaths: ['tools/backendkit/improvement'] }],
      }),
    ).toThrow('schema version 1');
  });

  it('validates a separately authorized high-risk isolated harness plan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backendkit-improvement-'));
    const planPath = 'docs/exec-plans/active/improvement.md';
    await mkdir(join(root, 'docs', 'exec-plans', 'active'), { recursive: true });
    await writeFile(join(root, planPath), executionPlan());
    const evidence = parseOperatingLedger(eligibleEvidence());
    const ledger = parseImprovementLedger({
      schemaVersion: 1,
      hypotheses: [improvementHypothesis()],
    });

    await expect(validateImprovementProgram(root, evidence, ledger)).resolves.toBeUndefined();
  });

  it('rejects publication authority in an improvement execution plan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backendkit-improvement-unsafe-'));
    const planPath = 'docs/exec-plans/active/improvement.md';
    await mkdir(join(root, 'docs', 'exec-plans', 'active'), { recursive: true });
    await writeFile(
      join(root, planPath),
      executionPlan().replace('edit, verify', 'edit, verify, push'),
    );
    const evidence = parseOperatingLedger(eligibleEvidence());
    const ledger = parseImprovementLedger({
      schemaVersion: 1,
      hypotheses: [improvementHypothesis()],
    });

    await expect(validateImprovementProgram(root, evidence, ledger)).rejects.toThrow(
      'not safely isolated',
    );
  });

  it('returns keep, revert, or inconclusive from later reviewed evidence only', () => {
    const hypothesis = parseImprovementLedger({
      schemaVersion: 1,
      hypotheses: [improvementHypothesis()],
    }).hypotheses[0];
    if (!hypothesis) throw new Error('Missing hypothesis fixture.');

    expect(
      evaluateShadow(parseOperatingLedger(eligibleEvidence([false, false])), hypothesis),
    ).toEqual({ status: 'inconclusive', observedTasks: 2, requiredTasks: 3 });
    expect(
      evaluateShadow(parseOperatingLedger(eligibleEvidence([false, false, false])), hypothesis),
    ).toMatchObject({ status: 'keep', baselineRateBps: 4000, observedRateBps: 0 });
    expect(
      evaluateShadow(parseOperatingLedger(eligibleEvidence([true, true, true])), hypothesis),
    ).toMatchObject({ status: 'revert', baselineRateBps: 4000, observedRateBps: 10_000 });
  });

  it('accepts a human terminal decision only when it matches shadow evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backendkit-improvement-terminal-'));
    const planPath = 'docs/exec-plans/active/improvement.md';
    await mkdir(join(root, 'docs', 'exec-plans', 'active'), { recursive: true });
    await writeFile(join(root, planPath), executionPlan());
    const evidence = parseOperatingLedger(eligibleEvidence([false, false, false]));
    const terminal = {
      ...improvementHypothesis(),
      status: 'kept',
      outcome: {
        decision: 'keep',
        decidedBy: 'human:maintainer',
        decidedAt: '2026-08-20T00:00:00.000Z',
        baselineRateBps: 4000,
        observedRateBps: 0,
        evaluatedTaskIds: ['observed-1', 'observed-2', 'observed-3'],
      },
    };
    const ledger = parseImprovementLedger({ schemaVersion: 1, hypotheses: [terminal] });
    await expect(validateImprovementProgram(root, evidence, ledger)).resolves.toBeUndefined();

    const contradicted = parseImprovementLedger({
      schemaVersion: 1,
      hypotheses: [{ ...terminal, outcome: { ...terminal.outcome, observedRateBps: 1000 } }],
    });
    await expect(validateImprovementProgram(root, evidence, contradicted)).rejects.toThrow(
      'contradicts shadow evidence',
    );
  });
});

function executionPlan(): string {
  return `# Improvement fixture

**Plan version:** 2
**Task ID:** isolated-improvement
**Status:** active
**Owner:** Fixture
**Risk:** high
**Authority:** edit and verify isolated harness behavior only
**Allowed paths:** tools/backendkit/task/task-verification.ts, docs/exec-plans/active/improvement.md
**Allowed actions:** edit, verify
**Maximum risk:** high
**Repair limit:** 1
**Task timeout:** 30m

## Impact Areas

- API/OpenAPI: no
- DB/Prisma/migrations: no
- Auth/session/RBAC: no
- Queue/jobs: no
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: no
- CI/release/harness: yes
`;
}
