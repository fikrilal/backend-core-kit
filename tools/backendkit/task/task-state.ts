import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { RepositoryChange } from './git-repository';
import { normalizeRepositoryPath, type Risk, type TaskBoundaries } from './task-plan';

export type TaskLifecycleStatus =
  | 'queued'
  | 'authorized'
  | 'preparing'
  | 'running'
  | 'verifying'
  | 'repairing'
  | 'ready_for_review'
  | 'escalated'
  | 'cancelled'
  | 'failed'
  | 'handed_off';

export type PreexistingChange = Readonly<{
  path: string;
  sources: RepositoryChange['sources'];
  contentFingerprint: string;
}>;

export type TaskTransition = Readonly<{
  status: TaskLifecycleStatus;
  occurredAt: string;
  reason: string;
}>;

export type TaskFailureRecord = Readonly<{
  attempt: number;
  occurredAt: string;
  code: string;
  taskFingerprint: string;
  repeatCount: number;
}>;

export type TaskState = Readonly<{
  schemaVersion: 2;
  authoritySchemaVersion: 1 | 2;
  taskId: string;
  status: TaskLifecycleStatus;
  startedAt: string;
  baseRevision: string;
  planPath: string;
  planSourceHash: string;
  authorityHash: string;
  declaredRisk: Risk;
  boundaries: TaskBoundaries;
  preexistingChanges: ReadonlyArray<PreexistingChange>;
  attempt: number;
  transitions: ReadonlyArray<TaskTransition>;
  failures: ReadonlyArray<TaskFailureRecord>;
}>;

export interface TaskStateStore {
  create(state: TaskState): Promise<void>;
  read(taskId: string): Promise<TaskState>;
  write(state: TaskState): Promise<void>;
}

export class FileTaskStateStore implements TaskStateStore {
  constructor(private readonly root: string) {}

  async create(state: TaskState): Promise<void> {
    const path = this.pathFor(state.taskId);
    try {
      await readFile(path);
      throw new TaskStateError('state-exists', `Task state already exists for '${state.taskId}'.`);
    } catch (error: unknown) {
      if (error instanceof TaskStateError) throw error;
      if (!isMissing(error)) throw error;
    }
    await atomicWrite(path, state);
  }

  async read(taskId: string): Promise<TaskState> {
    const path = this.pathFor(taskId);
    let decoded: unknown;
    try {
      decoded = JSON.parse(await readFile(path, 'utf8'));
    } catch (error: unknown) {
      if (isMissing(error)) {
        throw new TaskStateError('state-missing', `Task state does not exist for '${taskId}'.`);
      }
      throw new TaskStateError('state-unreadable', `Task state is unreadable for '${taskId}'.`);
    }
    return validateTaskState(decoded);
  }

  async write(state: TaskState): Promise<void> {
    await atomicWrite(this.pathFor(state.taskId), state);
  }

  private pathFor(taskId: string): string {
    if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(taskId)) {
      throw new TaskStateError('task-id-invalid', 'Task ID is invalid.');
    }
    return resolve(this.root, '.tmp', 'backendkit', 'tasks', taskId, 'state.json');
  }
}

export class TaskStateError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TaskStateError';
  }
}

export function validateTaskState(value: unknown): TaskState {
  if (!isObject(value)) return invalidState();
  if (value.schemaVersion === 1) return migrateV1(value);
  if (value.schemaVersion !== 2) return invalidState();

  const base = baseState(value);
  const authoritySchemaVersion = value.authoritySchemaVersion;
  if (authoritySchemaVersion !== 1 && authoritySchemaVersion !== 2) return invalidState();
  if (!isNonNegativeInteger(value.attempt)) return invalidState();
  return {
    schemaVersion: 2,
    authoritySchemaVersion,
    ...base,
    attempt: value.attempt,
    transitions: transitionsValue(value.transitions),
    failures: failuresValue(value.failures),
  };
}

export function transitionTask(
  state: TaskState,
  status: TaskLifecycleStatus,
  occurredAt: string,
  reason: string,
): TaskState {
  return {
    ...state,
    status,
    transitions: [...state.transitions, { status, occurredAt, reason }],
  };
}

async function atomicWrite(path: string, state: TaskState): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  await rename(temporaryPath, path);
}

function migrateV1(value: Record<string, unknown>): TaskState {
  const base = baseState(value);
  return {
    schemaVersion: 2,
    authoritySchemaVersion: 1,
    ...base,
    attempt: 0,
    transitions: [{ status: 'authorized', occurredAt: base.startedAt, reason: 'task.begin.v1' }],
    failures: [],
  };
}

function baseState(
  value: Record<string, unknown>,
): Omit<
  TaskState,
  'schemaVersion' | 'authoritySchemaVersion' | 'attempt' | 'transitions' | 'failures'
> {
  const taskId = stringField(value, 'taskId');
  const status = lifecycleStatus(value.status);
  const startedAt = isoDate(stringField(value, 'startedAt'));
  const baseRevision = stringField(value, 'baseRevision');
  const planPath = normalizeRepositoryPath(stringField(value, 'planPath'));
  const planSourceHash = sha256(stringField(value, 'planSourceHash'));
  const authorityHash = sha256(stringField(value, 'authorityHash'));
  const declaredRisk = riskValue(value.declaredRisk);
  const boundaries = boundariesValue(value.boundaries);
  const preexistingChanges = preexistingValue(value.preexistingChanges);
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(taskId) || !/^[0-9a-f]{40,64}$/.test(baseRevision)) {
    return invalidState();
  }
  return {
    taskId,
    status,
    startedAt,
    baseRevision,
    planPath,
    planSourceHash,
    authorityHash,
    declaredRisk,
    boundaries,
    preexistingChanges,
  };
}

function boundariesValue(value: unknown): TaskBoundaries {
  if (!isObject(value)) return invalidState();
  const allowedPaths = stringArray(value.allowedPaths);
  const allowedActions = stringArray(value.allowedActions).map(actionValue);
  const maximumRisk = riskValue(value.maximumRisk);
  if (
    allowedPaths.length === 0 ||
    allowedActions.length === 0 ||
    new Set(allowedPaths).size !== allowedPaths.length ||
    new Set(allowedActions).size !== allowedActions.length ||
    !isNonNegativeInteger(value.repairLimit) ||
    !isPositiveInteger(value.timeoutMs) ||
    value.timeoutMs > 24 * 3_600_000
  ) {
    return invalidState();
  }
  return {
    allowedPaths,
    allowedActions,
    maximumRisk,
    repairLimit: value.repairLimit,
    timeoutMs: value.timeoutMs,
  };
}

function preexistingValue(value: unknown): ReadonlyArray<PreexistingChange> {
  if (!Array.isArray(value)) return invalidState();
  return value.map((item) => {
    if (!isObject(item)) return invalidState();
    const path = normalizeRepositoryPath(stringField(item, 'path'));
    const contentFingerprint = sha256(stringField(item, 'contentFingerprint'));
    const sources = stringArray(item.sources).map(repositoryChangeSource);
    if (sources.length === 0) return invalidState();
    return { path, sources, contentFingerprint };
  });
}

function transitionsValue(value: unknown): ReadonlyArray<TaskTransition> {
  if (!Array.isArray(value) || value.length === 0) return invalidState();
  return value.map((item) => {
    if (!isObject(item)) return invalidState();
    return {
      status: lifecycleStatus(item.status),
      occurredAt: isoDate(stringField(item, 'occurredAt')),
      reason: stringField(item, 'reason'),
    };
  });
}

function failuresValue(value: unknown): ReadonlyArray<TaskFailureRecord> {
  if (!Array.isArray(value)) return invalidState();
  return value.map((item) => {
    if (
      !isObject(item) ||
      !isPositiveInteger(item.attempt) ||
      !isPositiveInteger(item.repeatCount)
    ) {
      return invalidState();
    }
    return {
      attempt: item.attempt,
      occurredAt: isoDate(stringField(item, 'occurredAt')),
      code: stringField(item, 'code'),
      taskFingerprint: sha256(stringField(item, 'taskFingerprint')),
      repeatCount: item.repeatCount,
    };
  });
}

function lifecycleStatus(value: unknown): TaskLifecycleStatus {
  switch (value) {
    case 'queued':
    case 'authorized':
    case 'preparing':
    case 'running':
    case 'verifying':
    case 'repairing':
    case 'ready_for_review':
    case 'escalated':
    case 'cancelled':
    case 'failed':
    case 'handed_off':
      return value;
    default:
      return invalidState();
  }
}

function riskValue(value: unknown): Risk {
  switch (value) {
    case 'low':
    case 'medium':
    case 'high':
      return value;
    default:
      return invalidState();
  }
}

function actionValue(value: string): TaskBoundaries['allowedActions'][number] {
  switch (value) {
    case 'edit':
    case 'verify':
    case 'commit':
    case 'push':
    case 'draft-pr':
    case 'update-pr':
    case 'merge':
    case 'migrate':
    case 'deploy':
      return value;
    default:
      return invalidState();
  }
}

function repositoryChangeSource(value: string): RepositoryChange['sources'][number] {
  switch (value) {
    case 'committed':
    case 'staged':
    case 'unstaged':
    case 'untracked':
      return value;
    default:
      return invalidState();
  }
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string' || field.length === 0) return invalidState();
  return field;
}

function stringArray(value: unknown): ReadonlyArray<string> {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    return invalidState();
  return value.filter((item): item is string => typeof item === 'string');
}

function isoDate(value: string): string {
  if (Number.isNaN(Date.parse(value))) return invalidState();
  return value;
}

function sha256(value: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) return invalidState();
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function invalidState(): never {
  throw new TaskStateError('state-invalid', 'Task state does not match a supported schema.');
}
