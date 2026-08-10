import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { normalizeRepositoryPath, type Risk } from '../task/task-plan';
import type { TaskLifecycleStatus, TaskTransition } from '../task/task-state';
import type { VerificationLaneId } from '../verification/lane-selection';
import type { DiagnosticReference } from './diagnostics';
import { writePrivateArtifact } from './private-artifact';

export type LaneOutcome = Readonly<{
  id: VerificationLaneId;
  status: 'passed' | 'failed';
  durationMs: number;
  failureCode?: string;
}>;

export type TaskEpisode = Readonly<{
  schemaVersion: 1;
  taskId: string;
  attempt: number;
  generatedAt: string;
  planPath: string;
  authorityHash: string;
  baseRevision: string;
  taskFingerprint: string;
  effectiveRisk: Risk;
  reviewRequired: boolean;
  matchedRiskRuleIds: ReadonlyArray<string>;
  changedPaths: ReadonlyArray<string>;
  runtimeReasons: ReadonlyArray<string>;
  lanes: ReadonlyArray<LaneOutcome>;
  transitions: ReadonlyArray<TaskTransition>;
  finalStatus: TaskLifecycleStatus;
  stopReason: string;
  diagnostic?: DiagnosticReference;
}>;

export class EpisodeStore {
  constructor(private readonly root: string) {}

  async write(episode: TaskEpisode): Promise<string> {
    validateEpisode(episode);
    const relativePath = `.tmp/backendkit/tasks/${episode.taskId}/episodes/attempt-${episode.attempt}.json`;
    await writePrivateArtifact(
      resolve(this.root, relativePath),
      `${JSON.stringify(episode, null, 2)}\n`,
    );
    return relativePath;
  }

  async read(taskId: string, attempt: number): Promise<TaskEpisode> {
    if (
      !/^[a-z0-9][a-z0-9-]{2,79}$/.test(taskId) ||
      !Number.isSafeInteger(attempt) ||
      attempt <= 0
    ) {
      throw new Error('Task episode identity is invalid.');
    }
    const source = await readFile(
      resolve(this.root, `.tmp/backendkit/tasks/${taskId}/episodes/attempt-${attempt}.json`),
    );
    if (source.byteLength > 64 * 1024) throw new Error('Task episode exceeds 65536 bytes.');
    let decoded: unknown;
    try {
      decoded = JSON.parse(source.toString('utf8'));
    } catch {
      throw new Error('Task episode is unreadable.');
    }
    return parseEpisode(decoded);
  }
}

export function validateEpisode(value: unknown): void {
  parseEpisode(value);
}

export function parseEpisode(value: unknown): TaskEpisode {
  if (!isObject(value) || value.schemaVersion !== 1) return invalidEpisode();
  if (
    typeof value.taskId !== 'string' ||
    !/^[a-z0-9][a-z0-9-]{2,79}$/.test(value.taskId) ||
    !Number.isSafeInteger(value.attempt) ||
    typeof value.attempt !== 'number' ||
    value.attempt <= 0 ||
    typeof value.generatedAt !== 'string' ||
    Number.isNaN(Date.parse(value.generatedAt)) ||
    typeof value.planPath !== 'string' ||
    !isCanonicalPath(value.planPath) ||
    !value.planPath.startsWith('docs/exec-plans/') ||
    typeof value.authorityHash !== 'string' ||
    typeof value.baseRevision !== 'string' ||
    typeof value.taskFingerprint !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.authorityHash) ||
    !/^[0-9a-f]{40,64}$/.test(value.baseRevision) ||
    !/^[0-9a-f]{64}$/.test(value.taskFingerprint) ||
    (value.effectiveRisk !== 'low' &&
      value.effectiveRisk !== 'medium' &&
      value.effectiveRisk !== 'high') ||
    typeof value.reviewRequired !== 'boolean' ||
    !isStableIdArray(value.matchedRiskRuleIds) ||
    !isCanonicalPathArray(value.changedPaths) ||
    !isStableIdArray(value.runtimeReasons) ||
    !Array.isArray(value.lanes) ||
    !value.lanes.every(isLane) ||
    !Array.isArray(value.transitions) ||
    !value.transitions.every(isTransition) ||
    !isLifecycleStatus(value.finalStatus) ||
    (value.diagnostic !== undefined && !isDiagnostic(value.diagnostic)) ||
    !isStableId(value.stopReason)
  ) {
    return invalidEpisode();
  }
  if (containsForbiddenKey(value)) return invalidEpisode();
  const allowedKeys = new Set([
    'schemaVersion',
    'taskId',
    'attempt',
    'generatedAt',
    'planPath',
    'authorityHash',
    'baseRevision',
    'taskFingerprint',
    'effectiveRisk',
    'reviewRequired',
    'matchedRiskRuleIds',
    'changedPaths',
    'runtimeReasons',
    'lanes',
    'transitions',
    'finalStatus',
    'stopReason',
    'diagnostic',
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return invalidEpisode();
  return {
    schemaVersion: 1,
    taskId: value.taskId,
    attempt: value.attempt,
    generatedAt: value.generatedAt,
    planPath: value.planPath,
    authorityHash: value.authorityHash,
    baseRevision: value.baseRevision,
    taskFingerprint: value.taskFingerprint,
    effectiveRisk: value.effectiveRisk,
    reviewRequired: value.reviewRequired,
    matchedRiskRuleIds: value.matchedRiskRuleIds,
    changedPaths: value.changedPaths,
    runtimeReasons: value.runtimeReasons,
    lanes: value.lanes.map((lane) => ({
      id: lane.id,
      status: lane.status,
      durationMs: lane.durationMs,
      ...(lane.failureCode ? { failureCode: lane.failureCode } : {}),
    })),
    transitions: value.transitions.map((transition) => ({
      status: transition.status,
      occurredAt: transition.occurredAt,
      reason: transition.reason,
    })),
    finalStatus: value.finalStatus,
    stopReason: value.stopReason,
    ...(value.diagnostic
      ? {
          diagnostic: {
            path: value.diagnostic.path,
            sha256: value.diagnostic.sha256,
            truncated: value.diagnostic.truncated,
          },
        }
      : {}),
  };
}

function containsForbiddenKey(value: unknown): boolean {
  const forbidden =
    /prompt|reasoning|stdout|stderr|environment|credential|token|cookie|requestBody|databaseUrl/i;
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!isObject(value)) return false;
  return Object.entries(value).some(
    ([key, nestedValue]) => forbidden.test(key) || containsForbiddenKey(nestedValue),
  );
}

function isStableIdArray(value: unknown): value is ReadonlyArray<string> {
  return Array.isArray(value) && value.every(isStableId) && new Set(value).size === value.length;
}

function isCanonicalPathArray(value: unknown): value is ReadonlyArray<string> {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && isCanonicalPath(item)) &&
    new Set(value).size === value.length
  );
}

function isCanonicalPath(value: string): boolean {
  try {
    return normalizeRepositoryPath(value) === value && !/[@\r\n\0]/.test(value);
  } catch {
    return false;
  }
}

function isStableId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/.test(value);
}

function isLane(value: unknown): value is LaneOutcome {
  return (
    isObject(value) &&
    (value.id === 'fast' || value.id === 'full' || value.id === 'runtime') &&
    (value.status === 'passed' || value.status === 'failed') &&
    typeof value.durationMs === 'number' &&
    Number.isFinite(value.durationMs) &&
    value.durationMs >= 0 &&
    (value.failureCode === undefined || isStableId(value.failureCode)) &&
    Object.keys(value).every((key) => ['id', 'status', 'durationMs', 'failureCode'].includes(key))
  );
}

function isTransition(value: unknown): value is TaskTransition {
  return (
    isObject(value) &&
    typeof value.status === 'string' &&
    typeof value.occurredAt === 'string' &&
    !Number.isNaN(Date.parse(value.occurredAt)) &&
    isStableId(value.reason) &&
    Object.keys(value).every((key) => ['status', 'occurredAt', 'reason'].includes(key))
  );
}

function isDiagnostic(value: unknown): value is DiagnosticReference {
  return (
    isObject(value) &&
    typeof value.path === 'string' &&
    isCanonicalPath(value.path) &&
    value.path.startsWith('.tmp/backendkit/tasks/') &&
    typeof value.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    typeof value.truncated === 'boolean' &&
    Object.keys(value).every((key) => ['path', 'sha256', 'truncated'].includes(key))
  );
}

function isLifecycleStatus(value: unknown): value is TaskLifecycleStatus {
  return [
    'queued',
    'authorized',
    'preparing',
    'running',
    'verifying',
    'repairing',
    'ready_for_review',
    'escalated',
    'cancelled',
    'failed',
    'handed_off',
  ].includes(typeof value === 'string' ? value : '');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidEpisode(): never {
  throw new Error('Task episode does not match sanitized schema version 1.');
}
