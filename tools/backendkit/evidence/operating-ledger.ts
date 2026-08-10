import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Risk } from '../task/task-plan';
import type { LaneOutcome } from './episode';

export type OperatingEvidenceEntry = Readonly<{
  taskId: string;
  attempt: number;
  episodeSha256: string;
  taskFingerprint: string;
  effectiveRisk: Risk;
  finalStatus: 'ready_for_review' | 'handed_off' | 'escalated' | 'failed';
  stopReason: string;
  hadRepairOrEscalation: boolean;
  lanes: ReadonlyArray<LaneOutcome>;
  review: Readonly<{
    reviewerId: string;
    reviewedAt: string;
    decision: 'accepted';
  }>;
  ci: Readonly<{
    revision: string;
    runUrl: string;
    status: 'passed';
  }>;
}>;

export type OperatingEvidenceLedger = Readonly<{
  schemaVersion: 1;
  entries: ReadonlyArray<OperatingEvidenceEntry>;
}>;

export type EvidenceEligibility = Readonly<{
  eligible: boolean;
  reviewedTasks: number;
  riskClasses: number;
  repairsOrEscalations: number;
  missing: ReadonlyArray<string>;
}>;

export async function readOperatingLedger(root: string): Promise<OperatingEvidenceLedger> {
  const source = await readFile(
    resolve(root, 'docs', 'engineering', 'operating-evidence-ledger.json'),
  );
  if (source.byteLength > 256 * 1024) throw new Error('Operating evidence ledger is too large.');
  try {
    return parseOperatingLedger(JSON.parse(source.toString('utf8')));
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('Operating evidence')) throw error;
    throw new Error('Operating evidence ledger is unreadable.', { cause: error });
  }
}

export function parseOperatingLedger(value: unknown): OperatingEvidenceLedger {
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries)) {
    return invalidLedger();
  }
  if (Object.keys(value).some((key) => key !== 'schemaVersion' && key !== 'entries')) {
    return invalidLedger();
  }
  const entries = value.entries.map(parseEntry);
  if (new Set(entries.map(({ taskId }) => taskId)).size !== entries.length) return invalidLedger();
  return { schemaVersion: 1, entries };
}

export function evidenceEligibility(ledger: OperatingEvidenceLedger): EvidenceEligibility {
  const reviewedTasks = ledger.entries.length;
  const riskClasses = new Set(ledger.entries.map(({ effectiveRisk }) => effectiveRisk)).size;
  const repairsOrEscalations = ledger.entries.filter(
    ({ hadRepairOrEscalation }) => hadRepairOrEscalation,
  ).length;
  const missing: string[] = [];
  if (reviewedTasks < 5) missing.push('five-reviewed-tasks');
  if (riskClasses < 2) missing.push('two-risk-classes');
  if (repairsOrEscalations < 1) missing.push('repair-or-escalation');
  return {
    eligible: missing.length === 0,
    reviewedTasks,
    riskClasses,
    repairsOrEscalations,
    missing,
  };
}

function parseEntry(value: unknown): OperatingEvidenceEntry {
  if (!isObject(value)) return invalidLedger();
  const allowed = new Set([
    'taskId',
    'attempt',
    'episodeSha256',
    'taskFingerprint',
    'effectiveRisk',
    'finalStatus',
    'stopReason',
    'hadRepairOrEscalation',
    'lanes',
    'review',
    'ci',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return invalidLedger();
  const taskId = stableTaskId(value.taskId);
  const attempt = positiveInteger(value.attempt);
  const episodeSha256 = hash(value.episodeSha256);
  const taskFingerprint = hash(value.taskFingerprint);
  const effectiveRisk = risk(value.effectiveRisk);
  const finalStatus = terminalStatus(value.finalStatus);
  const stopReason = stableId(value.stopReason);
  if (typeof value.hadRepairOrEscalation !== 'boolean') return invalidLedger();
  const lanes = laneList(value.lanes);
  const review = reviewRecord(value.review);
  const ci = ciRecord(value.ci);
  return {
    taskId,
    attempt,
    episodeSha256,
    taskFingerprint,
    effectiveRisk,
    finalStatus,
    stopReason,
    hadRepairOrEscalation: value.hadRepairOrEscalation,
    lanes,
    review,
    ci,
  };
}

function reviewRecord(value: unknown): OperatingEvidenceEntry['review'] {
  if (
    !isObject(value) ||
    Object.keys(value).some((key) => !['reviewerId', 'reviewedAt', 'decision'].includes(key)) ||
    value.decision !== 'accepted' ||
    typeof value.reviewerId !== 'string' ||
    !/^human:[a-z0-9][a-z0-9-]{1,63}$/.test(value.reviewerId) ||
    typeof value.reviewedAt !== 'string' ||
    Number.isNaN(Date.parse(value.reviewedAt))
  ) {
    return invalidLedger();
  }
  return { reviewerId: value.reviewerId, reviewedAt: value.reviewedAt, decision: 'accepted' };
}

function ciRecord(value: unknown): OperatingEvidenceEntry['ci'] {
  if (
    !isObject(value) ||
    Object.keys(value).some((key) => !['revision', 'runUrl', 'status'].includes(key)) ||
    value.status !== 'passed' ||
    typeof value.revision !== 'string' ||
    !/^[0-9a-f]{40}$/.test(value.revision) ||
    typeof value.runUrl !== 'string' ||
    !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+$/.test(
      value.runUrl,
    )
  ) {
    return invalidLedger();
  }
  return { revision: value.revision, runUrl: value.runUrl, status: 'passed' };
}

function laneList(value: unknown): ReadonlyArray<LaneOutcome> {
  if (!Array.isArray(value) || value.length === 0) return invalidLedger();
  const lanes = value.map((lane) => {
    if (
      !isObject(lane) ||
      Object.keys(lane).some((key) => !['id', 'status', 'durationMs'].includes(key)) ||
      lane.status !== 'passed' ||
      typeof lane.durationMs !== 'number' ||
      !Number.isFinite(lane.durationMs) ||
      lane.durationMs < 0
    ) {
      return invalidLedger();
    }
    const status: LaneOutcome['status'] = 'passed';
    return { id: laneId(lane.id), status, durationMs: lane.durationMs };
  });
  if (new Set(lanes.map(({ id }) => id)).size !== lanes.length) return invalidLedger();
  return lanes;
}

function laneId(value: unknown): LaneOutcome['id'] {
  if (value !== 'fast' && value !== 'full' && value !== 'runtime') return invalidLedger();
  return value;
}

function stableTaskId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(value)) {
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

function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) return invalidLedger();
  return value;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return invalidLedger();
  }
  return value;
}

function risk(value: unknown): Risk {
  if (value !== 'low' && value !== 'medium' && value !== 'high') return invalidLedger();
  return value;
}

function terminalStatus(value: unknown): OperatingEvidenceEntry['finalStatus'] {
  if (
    value !== 'ready_for_review' &&
    value !== 'handed_off' &&
    value !== 'escalated' &&
    value !== 'failed'
  ) {
    return invalidLedger();
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidLedger(): never {
  throw new Error('Operating evidence ledger does not match sanitized schema version 1.');
}
