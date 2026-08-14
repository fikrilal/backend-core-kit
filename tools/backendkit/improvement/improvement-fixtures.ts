export function evidenceEntry(
  taskId: string,
  effectiveRisk: 'medium' | 'high',
  changed: boolean,
  stopReason: string,
  reviewedAt = '2026-08-10T00:00:00.000Z',
) {
  return {
    taskId,
    attempt: 1,
    episodeSha256: 'a'.repeat(64),
    taskFingerprint: 'b'.repeat(64),
    effectiveRisk,
    finalStatus: changed ? 'escalated' : 'ready_for_review',
    stopReason,
    hadRepairOrEscalation: changed,
    lanes: [{ id: 'full', status: 'passed', durationMs: 10 }],
    review: { reviewerId: 'human:reviewer', reviewedAt, decision: 'accepted' },
    ci: {
      revision: 'c'.repeat(40),
      runUrl: `https://github.com/example/backend/actions/runs/${taskId.length}`,
      status: 'passed',
    },
  };
}

export function eligibleEvidence(laterChanged: ReadonlyArray<boolean> = []) {
  const baseline = [
    evidenceEntry('baseline-one', 'high', true, 'repair.exhausted'),
    evidenceEntry('baseline-two', 'medium', true, 'repair.exhausted'),
    evidenceEntry('baseline-three', 'medium', false, 'verification.passed'),
    evidenceEntry('baseline-four', 'high', false, 'verification.passed'),
    evidenceEntry('baseline-five', 'medium', false, 'verification.passed'),
  ];
  const later = laterChanged.map((changed, index) =>
    evidenceEntry(
      `observed-${index + 1}`,
      index % 2 === 0 ? 'high' : 'medium',
      changed,
      changed ? 'repair.exhausted' : 'verification.passed',
      `2026-08-${12 + index}T00:00:00.000Z`,
    ),
  );
  return { schemaVersion: 1, entries: [...baseline, ...later] };
}

export function improvementHypothesis(status = 'evaluating') {
  return {
    id: 'repair-types.reduce-rate',
    status,
    ownerId: 'human:owner',
    pattern: { stopReason: 'repair.exhausted', minimumAffectedTasks: 2 },
    targetComponent: 'tools/backendkit/task/task-verification.ts',
    metric: 'repair-or-escalation-rate',
    minimumImprovementBps: 2000,
    evaluationWindowTasks: 3,
    baselineTaskIds: [
      'baseline-one',
      'baseline-two',
      'baseline-three',
      'baseline-four',
      'baseline-five',
    ],
    invariants: [
      'authority.no-expansion',
      'evidence.no-sensitive-data',
      'publication.no-expansion',
      'risk.no-lowering',
      'verification.no-weakening',
    ],
    rollbackPaths: ['tools/backendkit/task/task-verification.ts'],
    ...(status === 'proposed'
      ? {}
      : {
          executionPlanPath: 'docs/exec-plans/active/improvement.md',
          approval: {
            approvedBy: 'human:approver',
            approvedAt: '2026-08-11T00:00:00.000Z',
          },
        }),
  };
}
