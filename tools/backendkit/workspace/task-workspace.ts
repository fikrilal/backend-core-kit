import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

import { normalizeRepositoryPath } from '../task/task-plan';
import { TaskService, type TaskPreflightResult } from '../task/task-service';
import {
  FileTaskStateStore,
  transitionTask,
  type TaskLifecycleStatus,
  type TaskState,
  type TaskStateStore,
} from '../task/task-state';
import { FileRepositoryLockStore, type RepositoryLockStore } from './repository-lock';
import {
  SystemWorktreeManager,
  type WorktreeDescriptor,
  type WorktreeManager,
} from './worktree-manager';

const maxPlanBytes = 64 * 1024;

export type TaskWorkspace = Readonly<{
  schemaVersion: 1;
  taskId: string;
  planPath: string;
  authorityHash: string;
  preparedAt: string;
  worktree: WorktreeDescriptor;
}>;

export type TaskWorkspaceResult = Readonly<{
  taskId: string;
  status: TaskLifecycleStatus;
  path: string;
  branch: string;
  baseRevision: string;
}>;

export interface TaskWorkspaceStore {
  create(workspace: TaskWorkspace): Promise<void>;
  read(taskId: string): Promise<TaskWorkspace>;
  delete(taskId: string): Promise<void>;
}

export interface WorkspacePreflightService {
  preflight(taskId: string, action: 'edit'): Promise<TaskPreflightResult>;
}

export class TaskWorkspaceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TaskWorkspaceError';
  }
}

export class FileTaskWorkspaceStore implements TaskWorkspaceStore {
  constructor(private readonly root: string) {}

  async create(workspace: TaskWorkspace): Promise<void> {
    const path = this.pathFor(workspace.taskId);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    try {
      await readFile(path);
      throw new TaskWorkspaceError(
        'workspace-exists',
        `Task workspace already exists for '${workspace.taskId}'.`,
      );
    } catch (error: unknown) {
      if (error instanceof TaskWorkspaceError) throw error;
      if (!isMissing(error)) throw error;
    }
    await atomicWrite(path, workspace);
  }

  async read(taskId: string): Promise<TaskWorkspace> {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(this.pathFor(taskId), 'utf8'));
    } catch (error: unknown) {
      if (isMissing(error)) {
        throw new TaskWorkspaceError(
          'workspace-missing',
          `Task workspace does not exist for '${taskId}'.`,
        );
      }
      throw new TaskWorkspaceError('workspace-invalid', 'Task workspace is unreadable.');
    }
    return validateTaskWorkspace(value);
  }

  async delete(taskId: string): Promise<void> {
    await unlink(this.pathFor(taskId));
  }

  private pathFor(taskId: string): string {
    assertTaskId(taskId);
    return resolve(this.root, '.tmp', 'backendkit', 'tasks', taskId, 'workspace.json');
  }
}

export class TaskWorkspaceService {
  private readonly states: TaskStateStore;
  private readonly workspaces: TaskWorkspaceStore;
  private readonly locks: RepositoryLockStore;
  private readonly worktrees: WorktreeManager;
  private readonly tasks: WorkspacePreflightService;

  constructor(
    private readonly root: string,
    options: Readonly<{
      states?: TaskStateStore;
      workspaces?: TaskWorkspaceStore;
      locks?: RepositoryLockStore;
      worktrees?: WorktreeManager;
      tasks?: WorkspacePreflightService;
      now?: () => string;
    }> = {},
  ) {
    this.states = options.states ?? new FileTaskStateStore(root);
    this.workspaces = options.workspaces ?? new FileTaskWorkspaceStore(root);
    this.locks = options.locks ?? new FileRepositoryLockStore(root);
    this.worktrees = options.worktrees ?? new SystemWorktreeManager(root);
    this.tasks = options.tasks ?? new TaskService(root, undefined, this.states);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  private readonly now: () => string;

  async prepare(taskId: string): Promise<TaskWorkspaceResult> {
    const lease = await this.locks.acquire(taskId, true);
    try {
      let state = await this.states.read(taskId);
      if (state.status !== 'authorized') {
        throw new TaskWorkspaceError(
          'workspace-state-not-preparable',
          'Only an authorized task without a workspace may be prepared.',
        );
      }
      const preflight = await this.tasks.preflight(taskId, 'edit');
      state = transitionTask(state, 'preparing', this.now(), 'workspace.preparing');
      await this.states.write(state);
      try {
        const worktree = await this.worktrees.prepare(taskId, state.baseRevision);
        const workspace: TaskWorkspace = {
          schemaVersion: 1,
          taskId,
          planPath: preflight.planPath,
          authorityHash: preflight.authorityHash,
          preparedAt: this.now(),
          worktree,
        };
        await this.workspaces.create(workspace);
        await materializePlan(
          worktree.path,
          preflight.planPath,
          await readBoundedFile(resolve(this.root, preflight.planPath), maxPlanBytes),
        );
        state = transitionTask(state, 'authorized', this.now(), 'workspace.prepared');
        await this.states.write(state);
        return resultFor(state, workspace);
      } catch (error: unknown) {
        state = transitionTask(state, 'failed', this.now(), 'workspace.prepare-failed');
        await this.states.write(state);
        throw error;
      }
    } finally {
      await lease.release();
    }
  }

  async status(taskId: string): Promise<TaskWorkspaceResult> {
    const state = await this.states.read(taskId);
    const workspace = await this.workspaces.read(taskId);
    await this.validate(state, workspace);
    return resultFor(state, workspace);
  }

  async cancel(taskId: string): Promise<TaskWorkspaceResult> {
    const lease = await this.locks.acquire(taskId, true);
    try {
      let state = await this.states.read(taskId);
      const workspace = await this.workspaces.read(taskId);
      await this.validate(state, workspace);
      if (state.status !== 'authorized' && state.status !== 'repairing') {
        throw new TaskWorkspaceError(
          'workspace-state-not-cancellable',
          'Only authorized or repairing task work may be cancelled.',
        );
      }
      state = transitionTask(state, 'cancelled', this.now(), 'workspace.cancelled');
      await this.states.write(state);
      return resultFor(state, workspace);
    } finally {
      await lease.release();
    }
  }

  async cleanup(taskId: string): Promise<TaskWorkspaceResult> {
    const lease = await this.locks.acquire(taskId, true);
    try {
      const state = await this.states.read(taskId);
      const workspace = await this.workspaces.read(taskId);
      await this.validate(state, workspace);
      if (!['ready_for_review', 'escalated', 'cancelled', 'failed'].includes(state.status)) {
        throw new TaskWorkspaceError(
          'workspace-state-not-cleanable',
          'Cleanup requires a stopped task.',
        );
      }
      await this.worktrees.cleanup(workspace.worktree);
      await this.workspaces.delete(taskId);
      return resultFor(state, workspace);
    } finally {
      await lease.release();
    }
  }

  async resolveCandidateRoot(taskId: string): Promise<string | undefined> {
    let workspace: TaskWorkspace;
    try {
      workspace = await this.workspaces.read(taskId);
    } catch (error: unknown) {
      if (error instanceof TaskWorkspaceError && error.code === 'workspace-missing') {
        return undefined;
      }
      throw error;
    }
    const state = await this.states.read(taskId);
    await this.validate(state, workspace);
    return workspace.worktree.path;
  }

  private async validate(state: TaskState, workspace: TaskWorkspace): Promise<void> {
    if (
      workspace.taskId !== state.taskId ||
      workspace.planPath !== state.planPath ||
      workspace.authorityHash !== state.authorityHash ||
      workspace.worktree.baseRevision !== state.baseRevision
    ) {
      throw new TaskWorkspaceError(
        'workspace-authority-mismatch',
        'Workspace metadata does not match task authority.',
      );
    }
    await this.worktrees.validate(workspace.worktree);
  }
}

export function validateTaskWorkspace(value: unknown): TaskWorkspace {
  if (!isObject(value) || value.schemaVersion !== 1) return invalidWorkspace();
  assertKeys(value, [
    'schemaVersion',
    'taskId',
    'planPath',
    'authorityHash',
    'preparedAt',
    'worktree',
  ]);
  const taskId = stringField(value, 'taskId');
  assertTaskId(taskId);
  if (!isObject(value.worktree)) return invalidWorkspace();
  assertKeys(value.worktree, ['repositoryIdentity', 'path', 'branch', 'baseRevision']);
  return {
    schemaVersion: 1,
    taskId,
    planPath: normalizeRepositoryPath(stringField(value, 'planPath')),
    authorityHash: hashField(value, 'authorityHash'),
    preparedAt: dateField(value, 'preparedAt'),
    worktree: {
      repositoryIdentity: hashField(value.worktree, 'repositoryIdentity'),
      path: absolutePath(stringField(value.worktree, 'path')),
      branch: branchField(value.worktree, 'branch'),
      baseRevision: revisionField(value.worktree, 'baseRevision'),
    },
  };
}

async function atomicWrite(path: string, workspace: TaskWorkspace): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(workspace, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  await rename(temporary, path);
}

async function materializePlan(
  worktreePath: string,
  planPath: string,
  source: string,
): Promise<void> {
  const destination = resolve(worktreePath, normalizeRepositoryPath(planPath));
  const fromWorktree = relative(worktreePath, destination);
  if (fromWorktree.startsWith('..') || fromWorktree.startsWith('/')) {
    throw new TaskWorkspaceError('workspace-plan-escape', 'Plan path escapes the task workspace.');
  }
  await mkdir(dirname(destination), { recursive: true });
  try {
    const existing = await readFile(destination, 'utf8');
    if (existing !== source) {
      throw new TaskWorkspaceError(
        'workspace-plan-mismatch',
        'Committed plan differs from the authorized snapshot.',
      );
    }
  } catch (error: unknown) {
    if (!isMissing(error)) throw error;
    await writeFile(destination, source, { encoding: 'utf8', flag: 'wx' });
  }
}

async function readBoundedFile(path: string, maxBytes: number): Promise<string> {
  const content = await readFile(path);
  if (content.byteLength > maxBytes) {
    throw new TaskWorkspaceError('workspace-plan-too-large', `Plan exceeds ${maxBytes} bytes.`);
  }
  return content.toString('utf8');
}

function resultFor(state: TaskState, workspace: TaskWorkspace): TaskWorkspaceResult {
  return {
    taskId: state.taskId,
    status: state.status,
    path: workspace.worktree.path,
    branch: workspace.worktree.branch,
    baseRevision: workspace.worktree.baseRevision,
  };
}

function assertTaskId(taskId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(taskId)) return invalidWorkspace();
}

function assertKeys(value: Record<string, unknown>, allowed: ReadonlyArray<string>): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) return invalidWorkspace();
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string' || field.length === 0) return invalidWorkspace();
  return field;
}

function hashField(value: Record<string, unknown>, key: string): string {
  const field = stringField(value, key);
  if (!/^[0-9a-f]{64}$/.test(field)) return invalidWorkspace();
  return field;
}

function revisionField(value: Record<string, unknown>, key: string): string {
  const field = stringField(value, key);
  if (!/^[0-9a-f]{40,64}$/.test(field)) return invalidWorkspace();
  return field;
}

function dateField(value: Record<string, unknown>, key: string): string {
  const field = stringField(value, key);
  if (Number.isNaN(Date.parse(field))) return invalidWorkspace();
  return field;
}

function absolutePath(value: string): string {
  if (!value.startsWith('/')) return invalidWorkspace();
  return value;
}

function branchField(value: Record<string, unknown>, key: string): string {
  const field = stringField(value, key);
  if (!/^backendkit\/[a-z0-9-]+$/.test(field)) return invalidWorkspace();
  return field;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function invalidWorkspace(): never {
  throw new TaskWorkspaceError('workspace-invalid', 'Task workspace metadata is invalid.');
}
