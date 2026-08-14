import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ProcessRunner } from '../process-runner';
import { systemProcessRunner } from '../process-runner';

export type WorktreeDescriptor = Readonly<{
  repositoryIdentity: string;
  path: string;
  branch: string;
  baseRevision: string;
}>;

export interface WorktreeManager {
  prepare(taskId: string, baseRevision: string): Promise<WorktreeDescriptor>;
  validate(descriptor: WorktreeDescriptor): Promise<void>;
  cleanup(descriptor: WorktreeDescriptor): Promise<void>;
}

export class WorktreeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WorktreeError';
  }
}

export class SystemWorktreeManager implements WorktreeManager {
  constructor(
    private readonly root: string,
    private readonly runner: ProcessRunner = systemProcessRunner,
  ) {}

  async prepare(taskId: string, baseRevision: string): Promise<WorktreeDescriptor> {
    assertTaskId(taskId);
    assertRevision(baseRevision);
    const canonicalRoot = await realpath(this.root);
    const repositoryIdentity = await this.repositoryIdentity(canonicalRoot);
    const branch = `backendkit/${taskId}`;
    const path = resolve(canonicalRoot, '.tmp', 'backendkit', 'worktrees', taskId);
    const ignored = await this.gitResult(['check-ignore', '--quiet', '--no-index', path]);
    if (ignored.code !== 0 || ignored.signal || ignored.timedOut) {
      throw new WorktreeError(
        'worktree-path-not-ignored',
        'Task worktree root must be ignored by the primary repository.',
      );
    }
    const branchExists = await this.gitResult([
      'show-ref',
      '--verify',
      '--quiet',
      `refs/heads/${branch}`,
    ]);
    if (
      branchExists.signal ||
      branchExists.timedOut ||
      (branchExists.code !== 0 && branchExists.code !== 1)
    ) {
      throw new WorktreeError('git-command-failed', 'Could not inspect the task branch.');
    }
    if (branchExists.code === 0) {
      throw new WorktreeError(
        'worktree-branch-exists',
        `Task branch '${branch}' already exists; inspect task workspace status or choose a new task ID.`,
      );
    }
    await this.git(['worktree', 'add', '-b', branch, path, baseRevision]);
    const descriptor = { repositoryIdentity, path, branch, baseRevision };
    await this.validate(descriptor);
    return descriptor;
  }

  async validate(descriptor: WorktreeDescriptor): Promise<void> {
    assertDescriptor(descriptor);
    const canonicalRoot = await realpath(this.root);
    const commonDirectory = await this.commonDirectory(canonicalRoot);
    if (descriptor.repositoryIdentity !== hash(`${canonicalRoot}\n${commonDirectory}`)) {
      throw new WorktreeError('repository-identity-mismatch', 'Repository identity changed.');
    }
    let canonicalWorktree: string;
    try {
      canonicalWorktree = await realpath(descriptor.path);
    } catch {
      throw new WorktreeError('worktree-missing', 'Task worktree does not exist.');
    }
    if (canonicalWorktree !== descriptor.path) {
      throw new WorktreeError('worktree-path-mismatch', 'Task worktree path changed.');
    }
    const worktreeCommonDirectory = await this.commonDirectory(descriptor.path);
    if (worktreeCommonDirectory !== commonDirectory) {
      throw new WorktreeError(
        'worktree-repository-mismatch',
        'Task path is not linked to the authorized repository.',
      );
    }
    const branch = (await this.git(['-C', descriptor.path, 'branch', '--show-current'])).trim();
    if (branch !== descriptor.branch) {
      throw new WorktreeError(
        'worktree-branch-mismatch',
        `Expected branch '${descriptor.branch}', found '${branch || 'detached HEAD'}'.`,
      );
    }
    const ancestry = await this.gitResult([
      '-C',
      descriptor.path,
      'merge-base',
      '--is-ancestor',
      descriptor.baseRevision,
      'HEAD',
    ]);
    if (ancestry.code !== 0) {
      throw new WorktreeError(
        'worktree-base-mismatch',
        'Task branch no longer descends from the authorized base revision.',
      );
    }
  }

  async cleanup(descriptor: WorktreeDescriptor): Promise<void> {
    await this.validate(descriptor);
    const status = await this.git(['-C', descriptor.path, 'status', '--porcelain=v1']);
    if (status.length > 0) {
      throw new WorktreeError(
        'worktree-dirty',
        'Task worktree has unrecorded changes; inspect or record them before cleanup.',
      );
    }
    await this.git(['worktree', 'remove', descriptor.path]);
  }

  private async git(args: ReadonlyArray<string>): Promise<string> {
    const result = await this.gitResult(args);
    if (result.code !== 0 || result.signal || result.timedOut) {
      throw new WorktreeError(
        'git-command-failed',
        `Git command failed: ${result.stderr.trim() || args[0] || 'unknown operation'}.`,
      );
    }
    return result.stdout;
  }

  private async gitResult(args: ReadonlyArray<string>) {
    return await this.runner.run({
      command: 'git',
      args,
      cwd: this.root,
      stdio: 'pipe',
      timeoutMs: 30_000,
    });
  }

  private async repositoryIdentity(canonicalRoot: string): Promise<string> {
    return hash(`${canonicalRoot}\n${await this.commonDirectory(canonicalRoot)}`);
  }

  private async commonDirectory(worktreePath: string): Promise<string> {
    const value = (await this.git(['-C', worktreePath, 'rev-parse', '--git-common-dir'])).trim();
    return await realpath(resolve(worktreePath, value));
  }
}

function assertDescriptor(descriptor: WorktreeDescriptor): void {
  assertRevision(descriptor.baseRevision);
  if (!/^[0-9a-f]{64}$/.test(descriptor.repositoryIdentity)) {
    throw new WorktreeError('repository-identity-invalid', 'Repository identity is invalid.');
  }
  if (!descriptor.path.startsWith('/') || !/^backendkit\/[a-z0-9-]+$/.test(descriptor.branch)) {
    throw new WorktreeError('worktree-descriptor-invalid', 'Worktree descriptor is invalid.');
  }
}

function assertTaskId(taskId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(taskId)) {
    throw new WorktreeError('task-id-invalid', 'Task ID is invalid.');
  }
}

function assertRevision(revision: string): void {
  if (!/^[0-9a-f]{40,64}$/.test(revision)) {
    throw new WorktreeError('base-revision-invalid', 'Base revision is invalid.');
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
