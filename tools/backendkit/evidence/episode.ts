import { resolve } from 'node:path';

import type { Risk } from '../task/task-plan';
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
}

export function validateEpisode(value: unknown): void {
  if (!isObject(value) || value.schemaVersion !== 1) return invalidEpisode();
  if (
    typeof value.taskId !== 'string' ||
    !Number.isSafeInteger(value.attempt) ||
    typeof value.attempt !== 'number' ||
    value.attempt <= 0 ||
    typeof value.generatedAt !== 'string' ||
    Number.isNaN(Date.parse(value.generatedAt)) ||
    typeof value.planPath !== 'string' ||
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
    !isStringArray(value.matchedRiskRuleIds) ||
    !isStringArray(value.changedPaths) ||
    !isStringArray(value.runtimeReasons) ||
    !Array.isArray(value.lanes) ||
    !value.lanes.every(isLane) ||
    !Array.isArray(value.transitions) ||
    !value.transitions.every(isTransition) ||
    !isLifecycleStatus(value.finalStatus) ||
    (value.diagnostic !== undefined && !isDiagnostic(value.diagnostic)) ||
    typeof value.stopReason !== 'string'
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

function isStringArray(value: unknown): value is ReadonlyArray<string> {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isLane(value: unknown): boolean {
  return (
    isObject(value) &&
    (value.id === 'fast' || value.id === 'full' || value.id === 'runtime') &&
    (value.status === 'passed' || value.status === 'failed') &&
    typeof value.durationMs === 'number' &&
    Number.isFinite(value.durationMs) &&
    value.durationMs >= 0 &&
    (value.failureCode === undefined || typeof value.failureCode === 'string')
  );
}

function isTransition(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.status === 'string' &&
    typeof value.occurredAt === 'string' &&
    !Number.isNaN(Date.parse(value.occurredAt)) &&
    typeof value.reason === 'string'
  );
}

function isDiagnostic(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.path === 'string' &&
    typeof value.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    typeof value.truncated === 'boolean' &&
    Object.keys(value).every((key) => ['path', 'sha256', 'truncated'].includes(key))
  );
}

function isLifecycleStatus(value: unknown): boolean {
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
