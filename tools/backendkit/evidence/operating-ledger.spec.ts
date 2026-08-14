import { evidenceEligibility, parseOperatingLedger } from './operating-ledger';

describe('operating evidence ledger', () => {
  it('keeps the empty initial ledger valid and ineligible', () => {
    const ledger = parseOperatingLedger({ schemaVersion: 1, entries: [] });
    expect(evidenceEligibility(ledger)).toEqual({
      eligible: false,
      reviewedTasks: 0,
      riskClasses: 0,
      repairsOrEscalations: 0,
      missing: ['five-reviewed-tasks', 'two-risk-classes', 'repair-or-escalation'],
    });
  });

  it('requires five unique reviewed tasks, two risks, and a repair or escalation', () => {
    const entries = Array.from({ length: 5 }, (_, index) =>
      entry(`reviewed-task-${index}`, index === 0 ? 'high' : 'medium', index === 0),
    );
    expect(evidenceEligibility(parseOperatingLedger({ schemaVersion: 1, entries }))).toMatchObject({
      eligible: true,
      reviewedTasks: 5,
      riskClasses: 2,
      repairsOrEscalations: 1,
    });
  });

  it('rejects duplicate tasks, agent review, raw fields, and credential-shaped CI URLs', () => {
    const valid = entry('reviewed-task', 'high', true);
    expect(() => parseOperatingLedger({ schemaVersion: 1, entries: [valid, valid] })).toThrow(
      'sanitized schema',
    );
    expect(() =>
      parseOperatingLedger({
        schemaVersion: 1,
        entries: [{ ...valid, review: { ...valid.review, reviewerId: 'agent:codex' } }],
      }),
    ).toThrow('sanitized schema');
    expect(() =>
      parseOperatingLedger({ schemaVersion: 1, entries: [{ ...valid, prompt: 'secret' }] }),
    ).toThrow('sanitized schema');
    expect(() =>
      parseOperatingLedger({
        schemaVersion: 1,
        entries: [
          {
            ...valid,
            ci: { ...valid.ci, runUrl: 'https://token@github.com/example/repo/actions/runs/1' },
          },
        ],
      }),
    ).toThrow('sanitized schema');
  });
});

function entry(taskId: string, effectiveRisk: 'medium' | 'high', changed: boolean) {
  return {
    taskId,
    attempt: 1,
    episodeSha256: 'a'.repeat(64),
    taskFingerprint: 'b'.repeat(64),
    effectiveRisk,
    finalStatus: changed ? 'escalated' : 'ready_for_review',
    stopReason: changed ? 'repair.limit-exhausted' : 'verification.passed',
    hadRepairOrEscalation: changed,
    lanes: [{ id: 'full', status: 'passed', durationMs: 10 }],
    review: {
      reviewerId: 'human:maintainer',
      reviewedAt: '2026-08-10T00:00:00.000Z',
      decision: 'accepted',
    },
    ci: {
      revision: 'c'.repeat(40),
      runUrl: 'https://github.com/example/backend/actions/runs/42',
      status: 'passed',
    },
  };
}
