import { evidenceEligibility, type OperatingEvidenceLedger } from '../evidence/operating-ledger';

export type EvidenceTrend = Readonly<{
  eligible: boolean;
  reviewedTasks: number;
  riskClasses: number;
  repairOrEscalationRateBps: number;
  escalationRateBps: number;
  recurringStopReasons: ReadonlyArray<Readonly<{ id: string; count: number }>>;
}>;

export function analyzeEvidenceTrends(ledger: OperatingEvidenceLedger): EvidenceTrend {
  const eligibility = evidenceEligibility(ledger);
  const total = ledger.entries.length;
  const rate = (count: number): number => (total === 0 ? 0 : Math.round((count * 10_000) / total));
  const reasons = new Map<string, number>();
  for (const entry of ledger.entries) {
    reasons.set(entry.stopReason, (reasons.get(entry.stopReason) ?? 0) + 1);
  }
  return {
    eligible: eligibility.eligible,
    reviewedTasks: total,
    riskClasses: eligibility.riskClasses,
    repairOrEscalationRateBps: rate(
      ledger.entries.filter(({ hadRepairOrEscalation }) => hadRepairOrEscalation).length,
    ),
    escalationRateBps: rate(
      ledger.entries.filter(
        ({ finalStatus }) => finalStatus === 'escalated' || finalStatus === 'failed',
      ).length,
    ),
    recurringStopReasons: [...reasons.entries()]
      .filter(([, count]) => count >= 2)
      .map(([id, count]) => ({ id, count }))
      .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id)),
  };
}
