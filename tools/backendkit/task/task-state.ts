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

export type TaskState = Readonly<{
  schemaVersion: 1;
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
}>;

export interface TaskStateStore {
  create(state: TaskState): Promise<void>;
  read(taskId: string): Promise<TaskState>;
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
  if (!isObject(value) || value.schemaVersion !== 1) return invalidState();
  const taskId = stringField(value, 'taskId');
  const status = lifecycleStatus(value.status);
  const startedAt = stringField(value, 'startedAt');
  const baseRevision = stringField(value, 'baseRevision');
  const planPath = normalizeRepositoryPath(stringField(value, 'planPath'));
  const planSourceHash = stringField(value, 'planSourceHash');
  const authorityHash = stringField(value, 'authorityHash');
  const declaredRisk = riskValue(value.declaredRisk);
  const boundaries = boundariesValue(value.boundaries);
  const preexistingChanges = preexistingValue(value.preexistingChanges);

  if (
    !/^[a-z0-9][a-z0-9-]{2,79}$/.test(taskId) ||
    !/^[0-9a-f]{40,64}$/.test(baseRevision) ||
    !/^[0-9a-f]{64}$/.test(planSourceHash) ||
    !/^[0-9a-f]{64}$/.test(authorityHash) ||
    Number.isNaN(Date.parse(startedAt))
  ) {
    return invalidState();
  }
  return {
    schemaVersion: 1,
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

function boundariesValue(value: unknown): TaskBoundaries {
  if (!isObject(value)) return invalidState();
  const allowedPaths = stringArray(value.allowedPaths);
  const rawActions = stringArray(value.allowedActions);
  const allowedActions = rawActions.map((action) => actionValue(action));
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
    const contentFingerprint = stringField(item, 'contentFingerprint');
    const rawSources = stringArray(item.sources);
    const sources = rawSources.map(repositoryChangeSource);
    if (sources.length === 0 || !/^[0-9a-f]{64}$/.test(contentFingerprint)) return invalidState();
    return { path, sources, contentFingerprint };
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
  throw new TaskStateError('state-invalid', 'Task state does not match schema version 1.');
}
