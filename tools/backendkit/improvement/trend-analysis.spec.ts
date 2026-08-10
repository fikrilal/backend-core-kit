import { parseOperatingLedger } from '../evidence/operating-ledger';
import { analyzeEvidenceTrends } from './trend-analysis';
import { evidenceEntry } from './improvement-fixtures';

describe('operating evidence trend analysis', () => {
  it('reports the empty ledger without inventing trends', () => {
    expect(analyzeEvidenceTrends(parseOperatingLedger({ schemaVersion: 1, entries: [] }))).toEqual({
      eligible: false,
      reviewedTasks: 0,
      riskClasses: 0,
      repairOrEscalationRateBps: 0,
      escalationRateBps: 0,
      recurringStopReasons: [],
    });
  });

  it('aggregates rates and recurring stable reasons deterministically', () => {
    const ledger = parseOperatingLedger({
      schemaVersion: 1,
      entries: [
        evidenceEntry('task-one', 'medium', true, 'repair.exhausted'),
        evidenceEntry('task-two', 'high', false, 'verification.passed'),
        evidenceEntry('task-three', 'high', true, 'repair.exhausted'),
        evidenceEntry('task-four', 'medium', false, 'verification.passed'),
        evidenceEntry('task-five', 'medium', false, 'verification.passed'),
      ],
    });

    expect(analyzeEvidenceTrends(ledger)).toEqual({
      eligible: true,
      reviewedTasks: 5,
      riskClasses: 2,
      repairOrEscalationRateBps: 4000,
      escalationRateBps: 4000,
      recurringStopReasons: [
        { id: 'verification.passed', count: 3 },
        { id: 'repair.exhausted', count: 2 },
      ],
    });
  });
});
