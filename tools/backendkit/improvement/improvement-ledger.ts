import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  evidenceEligibility,
  type OperatingEvidenceEntry,
  type OperatingEvidenceLedger,
} from '../evidence/operating-ledger';
import { normalizeRepositoryPath, parseTaskPlan } from '../task/task-plan';

export const immutableImprovementInvariants: ReadonlyArray<string> = [
  'authority.no-expansion',
  'evidence.no-sensitive-data',
  'publication.no-expansion',
  'risk.no-lowering',
  'verification.no-weakening',
];

export type ImprovementMetric = 'repair-or-escalation-rate' | 'escalation-rate';
export type ImprovementStatus = 'proposed' | 'approved' | 'evaluating' | 'kept' | 'reverted';

export type ImprovementHypothesis = Readonly<{
  id: string;
  status: ImprovementStatus;
  ownerId: string;
  pattern: Readonly<{ stopReason: string; minimumAffectedTasks: number }>;
  targetComponent: string;
  metric: ImprovementMetric;
  minimumImprovementBps: number;
  evaluationWindowTasks: number;
  baselineTaskIds: ReadonlyArray<string>;
  invariants: ReadonlyArray<string>;
  rollbackPaths: ReadonlyArray<string>;
  executionPlanPath?: string;
  approval?: Readonly<{ approvedBy: string; approvedAt: string }>;
  outcome?: Readonly<{
    decision: 'keep' | 'revert';
    decidedBy: string;
    decidedAt: string;
    baselineRateBps: number;
    observedRateBps: number;
    evaluatedTaskIds: ReadonlyArray<string>;
  }>;
}>;

export type ImprovementLedger = Readonly<{
  schemaVersion: 1;
  hypotheses: ReadonlyArray<ImprovementHypothesis>;
}>;

export type ShadowResult =
  | Readonly<{ status: 'disabled' }>
  | Readonly<{ status: 'inconclusive'; observedTasks: number; requiredTasks: number }>
  | Readonly<{
      status: 'keep' | 'revert';
      baselineRateBps: number;
      observedRateBps: number;
      improvementBps: number;
      evaluatedTaskIds: ReadonlyArray<string>;
    }>;

export async function readImprovementLedger(root: string): Promise<ImprovementLedger> {
  const source = await readFile(
    resolve(root, 'docs', 'engineering', 'harness-improvement-ledger.json'),
  );
  if (source.byteLength > 256 * 1024) throw new Error('Harness improvement ledger is too large.');
  try {
    return parseImprovementLedger(JSON.parse(source.toString('utf8')));
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('Harness improvement')) throw error;
    throw new Error('Harness improvement ledger is unreadable.', { cause: error });
  }
}

export function parseImprovementLedger(value: unknown): ImprovementLedger {
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.hypotheses)) {
    return invalidLedger();
  }
  if (Object.keys(value).some((key) => key !== 'schemaVersion' && key !== 'hypotheses')) {
    return invalidLedger();
  }
  const hypotheses = value.hypotheses.map(parseHypothesis);
  if (new Set(hypotheses.map(({ id }) => id)).size !== hypotheses.length) return invalidLedger();
  return { schemaVersion: 1, hypotheses };
}

export async function validateImprovementProgram(
  root: string,
  evidence: OperatingEvidenceLedger,
  improvements: ImprovementLedger,
): Promise<void> {
  if (!evidenceEligibility(evidence).eligible && improvements.hypotheses.length > 0) {
    throw new Error('Harness improvement hypotheses are disabled until evidence is eligible.');
  }
  const entries = new Map(evidence.entries.map((entry) => [entry.taskId, entry]));
  for (const hypothesis of improvements.hypotheses) {
    const baseline = hypothesis.baselineTaskIds.map((taskId) => {
      const entry = entries.get(taskId);
      if (!entry) throw new Error(`Harness improvement baseline task is missing: '${taskId}'.`);
      return entry;
    });
    const affected = baseline.filter(
      ({ stopReason }) => stopReason === hypothesis.pattern.stopReason,
    ).length;
    if (affected < hypothesis.pattern.minimumAffectedTasks) {
      throw new Error(`Harness improvement '${hypothesis.id}' has no recurring baseline pattern.`);
    }
    if (hypothesis.executionPlanPath) {
      await validateIsolatedExecutionPlan(root, hypothesis.executionPlanPath);
    }
    if (hypothesis.outcome) {
      const shadow = evaluateShadow(evidence, hypothesis);
      if (
        (shadow.status !== 'keep' && shadow.status !== 'revert') ||
        shadow.status !== hypothesis.outcome.decision ||
        shadow.baselineRateBps !== hypothesis.outcome.baselineRateBps ||
        shadow.observedRateBps !== hypothesis.outcome.observedRateBps ||
        !sameStrings(shadow.evaluatedTaskIds, hypothesis.outcome.evaluatedTaskIds)
      ) {
        throw new Error(
          `Harness improvement '${hypothesis.id}' outcome contradicts shadow evidence.`,
        );
      }
    }
  }
}

export function evaluateShadow(
  evidence: OperatingEvidenceLedger,
  hypothesis: ImprovementHypothesis,
): ShadowResult {
  if (!evidenceEligibility(evidence).eligible) return { status: 'disabled' };
  const approval = hypothesis.approval;
  if (!approval || hypothesis.status === 'proposed' || hypothesis.status === 'approved') {
    return {
      status: 'inconclusive',
      observedTasks: 0,
      requiredTasks: hypothesis.evaluationWindowTasks,
    };
  }
  const baselineIds = new Set(hypothesis.baselineTaskIds);
  const baseline = evidence.entries.filter(({ taskId }) => baselineIds.has(taskId));
  const observed = evidence.entries
    .filter(
      ({ taskId, review }) =>
        !baselineIds.has(taskId) && Date.parse(review.reviewedAt) > Date.parse(approval.approvedAt),
    )
    .sort(
      (left, right) =>
        Date.parse(left.review.reviewedAt) - Date.parse(right.review.reviewedAt) ||
        left.taskId.localeCompare(right.taskId),
    )
    .slice(0, hypothesis.evaluationWindowTasks);
  if (observed.length < hypothesis.evaluationWindowTasks) {
    return {
      status: 'inconclusive',
      observedTasks: observed.length,
      requiredTasks: hypothesis.evaluationWindowTasks,
    };
  }
  const baselineRateBps = metricRate(baseline, hypothesis.metric);
  const observedRateBps = metricRate(observed, hypothesis.metric);
  const improvementBps = baselineRateBps - observedRateBps;
  return {
    status: improvementBps >= hypothesis.minimumImprovementBps ? 'keep' : 'revert',
    baselineRateBps,
    observedRateBps,
    improvementBps,
    evaluatedTaskIds: observed.map(({ taskId }) => taskId),
  };
}

async function validateIsolatedExecutionPlan(root: string, path: string): Promise<void> {
  const source = await readFile(resolve(root, path), 'utf8');
  if (Buffer.byteLength(source) > 128 * 1024)
    throw new Error('Harness execution plan is too large.');
  const plan = parseTaskPlan(path, source);
  if (
    plan.risk !== 'high' ||
    plan.boundaries.maximumRisk !== 'high' ||
    !plan.impacts.harness ||
    !sameStrings([...plan.boundaries.allowedActions].sort(), ['edit', 'verify']) ||
    !plan.boundaries.allowedPaths.every(isHarnessImprovementPath)
  ) {
    throw new Error(`Harness execution plan '${path}' is not safely isolated.`);
  }
}

function parseHypothesis(value: unknown): ImprovementHypothesis {
  if (!isObject(value)) return invalidLedger();
  const allowed = new Set([
    'id',
    'status',
    'ownerId',
    'pattern',
    'targetComponent',
    'metric',
    'minimumImprovementBps',
    'evaluationWindowTasks',
    'baselineTaskIds',
    'invariants',
    'rollbackPaths',
    'executionPlanPath',
    'approval',
    'outcome',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return invalidLedger();
  const id = stableId(value.id);
  const status = improvementStatus(value.status);
  const ownerId = humanId(value.ownerId);
  const pattern = patternRecord(value.pattern);
  const targetComponent = safePath(value.targetComponent);
  const metric = improvementMetric(value.metric);
  const minimumImprovementBps = boundedInteger(value.minimumImprovementBps, 1, 10_000);
  const evaluationWindowTasks = boundedInteger(value.evaluationWindowTasks, 3, 100);
  const baselineTaskIds = uniqueTaskIds(value.baselineTaskIds, 2);
  const invariants = stableStringArray(value.invariants);
  if (!sameStrings([...invariants].sort(), [...immutableImprovementInvariants].sort())) {
    return invalidLedger();
  }
  const rollbackPaths = uniquePaths(value.rollbackPaths);
  const executionPlanPath = optionalPlanPath(value.executionPlanPath);
  const approval =
    value.approval === undefined ? undefined : approvalRecord(value.approval, ownerId);
  const outcome = value.outcome === undefined ? undefined : outcomeRecord(value.outcome);
  const terminal = status === 'kept' || status === 'reverted';
  if (
    (status === 'proposed' && (executionPlanPath || approval || outcome)) ||
    (status !== 'proposed' && (!executionPlanPath || !approval)) ||
    terminal !== Boolean(outcome) ||
    (terminal && outcome?.decision !== (status === 'kept' ? 'keep' : 'revert'))
  ) {
    return invalidLedger();
  }
  return {
    id,
    status,
    ownerId,
    pattern,
    targetComponent,
    metric,
    minimumImprovementBps,
    evaluationWindowTasks,
    baselineTaskIds,
    invariants,
    rollbackPaths,
    ...(executionPlanPath ? { executionPlanPath } : {}),
    ...(approval ? { approval } : {}),
    ...(outcome ? { outcome } : {}),
  };
}

function patternRecord(value: unknown): ImprovementHypothesis['pattern'] {
  if (
    !isObject(value) ||
    Object.keys(value).some((key) => !['stopReason', 'minimumAffectedTasks'].includes(key))
  ) {
    return invalidLedger();
  }
  return {
    stopReason: stableId(value.stopReason),
    minimumAffectedTasks: boundedInteger(value.minimumAffectedTasks, 2, 100),
  };
}

function approvalRecord(
  value: unknown,
  ownerId: string,
): NonNullable<ImprovementHypothesis['approval']> {
  if (
    !isObject(value) ||
    Object.keys(value).some((key) => !['approvedBy', 'approvedAt'].includes(key))
  ) {
    return invalidLedger();
  }
  const approvedBy = humanId(value.approvedBy);
  if (approvedBy === ownerId) return invalidLedger();
  return { approvedBy, approvedAt: isoDate(value.approvedAt) };
}

function outcomeRecord(value: unknown): NonNullable<ImprovementHypothesis['outcome']> {
  if (
    !isObject(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          'decision',
          'decidedBy',
          'decidedAt',
          'baselineRateBps',
          'observedRateBps',
          'evaluatedTaskIds',
        ].includes(key),
    ) ||
    (value.decision !== 'keep' && value.decision !== 'revert')
  ) {
    return invalidLedger();
  }
  return {
    decision: value.decision,
    decidedBy: humanId(value.decidedBy),
    decidedAt: isoDate(value.decidedAt),
    baselineRateBps: boundedInteger(value.baselineRateBps, 0, 10_000),
    observedRateBps: boundedInteger(value.observedRateBps, 0, 10_000),
    evaluatedTaskIds: uniqueTaskIds(value.evaluatedTaskIds, 3),
  };
}

function metricRate(
  entries: ReadonlyArray<OperatingEvidenceEntry>,
  metric: ImprovementMetric,
): number {
  if (entries.length === 0) return 0;
  const count = entries.filter((entry) =>
    metric === 'repair-or-escalation-rate'
      ? entry.hadRepairOrEscalation
      : entry.finalStatus === 'escalated' || entry.finalStatus === 'failed',
  ).length;
  return Math.round((count * 10_000) / entries.length);
}

function isHarnessImprovementPath(path: string): boolean {
  const normalized = normalizeRepositoryPath(path);
  return (
    normalized.startsWith('tools/backendkit/') ||
    normalized.startsWith('docs/engineering/') ||
    normalized.startsWith('docs/adr/') ||
    normalized.startsWith('docs/exec-plans/') ||
    normalized.startsWith('.github/workflows/') ||
    normalized === 'package.json' ||
    normalized === 'package-lock.json'
  );
}

function safePath(value: unknown): string {
  if (typeof value !== 'string') return invalidLedger();
  const path = normalizeRepositoryPath(value);
  if (path !== value || !isHarnessImprovementPath(path)) return invalidLedger();
  return path;
}

function uniquePaths(value: unknown): ReadonlyArray<string> {
  if (!Array.isArray(value) || value.length === 0) return invalidLedger();
  const paths = value.map((item) => {
    const path = safePath(item);
    if (!/\.[a-z0-9]+$/i.test(path)) return invalidLedger();
    return path;
  });
  if (new Set(paths).size !== paths.length) return invalidLedger();
  return paths;
}

function optionalPlanPath(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'string' ||
    !/^docs\/exec-plans\/(?:active|completed)\/[a-z0-9_-]+\.md$/.test(value)
  ) {
    return invalidLedger();
  }
  return value;
}

function stableId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/.test(value)) {
    return invalidLedger();
  }
  return value;
}

function humanId(value: unknown): string {
  if (typeof value !== 'string' || !/^human:[a-z0-9][a-z0-9-]{1,63}$/.test(value)) {
    return invalidLedger();
  }
  return value;
}

function uniqueTaskIds(value: unknown, minimum: number): ReadonlyArray<string> {
  if (!Array.isArray(value) || value.length < minimum) return invalidLedger();
  const ids = value.map((item) => {
    if (typeof item !== 'string' || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(item)) {
      return invalidLedger();
    }
    return item;
  });
  if (new Set(ids).size !== ids.length) return invalidLedger();
  return ids;
}

function stableStringArray(value: unknown): ReadonlyArray<string> {
  if (!Array.isArray(value)) return invalidLedger();
  const values = value.map(stableId);
  if (new Set(values).size !== values.length) return invalidLedger();
  return values;
}

function improvementMetric(value: unknown): ImprovementMetric {
  if (value !== 'repair-or-escalation-rate' && value !== 'escalation-rate') {
    return invalidLedger();
  }
  return value;
}

function improvementStatus(value: unknown): ImprovementStatus {
  if (
    value !== 'proposed' &&
    value !== 'approved' &&
    value !== 'evaluating' &&
    value !== 'kept' &&
    value !== 'reverted'
  ) {
    return invalidLedger();
  }
  return value;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    return invalidLedger();
  }
  return value;
}

function isoDate(value: unknown): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return invalidLedger();
  return value;
}

function sameStrings(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidLedger(): never {
  throw new Error('Harness improvement ledger does not match schema version 1.');
}
