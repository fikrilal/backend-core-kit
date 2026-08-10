import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export type RepositoryLock = Readonly<{
  schemaVersion: 1;
  taskId: string;
  pid: number;
  acquiredAt: string;
  nonce: string;
}>;

export interface RepositoryLockLease {
  readonly recoveredStaleLock: boolean;
  release(): Promise<void>;
}

export interface RepositoryLockStore {
  acquire(taskId: string, recoverStale?: boolean): Promise<RepositoryLockLease>;
}

export class RepositoryLockError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RepositoryLockError';
  }
}

export class FileRepositoryLockStore implements RepositoryLockStore {
  private readonly path: string;

  constructor(
    root: string,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly pid: number = process.pid,
  ) {
    this.path = resolve(root, '.tmp', 'backendkit', 'repository-lock.json');
  }

  async acquire(taskId: string, recoverStale = false): Promise<RepositoryLockLease> {
    assertTaskId(taskId);
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    let recoveredStaleLock = false;
    try {
      await this.create(taskId);
    } catch (error: unknown) {
      if (!isExists(error)) throw error;
      const current = await this.read();
      if (isProcessAlive(current.pid)) {
        throw new RepositoryLockError(
          'repository-locked',
          `Repository command lock is owned by task '${current.taskId}' in process ${current.pid}.`,
        );
      }
      if (!recoverStale) {
        throw new RepositoryLockError(
          'repository-lock-stale',
          `Stale repository command lock belongs to task '${current.taskId}'; retry through a task workspace command.`,
        );
      }
      await unlink(this.path);
      recoveredStaleLock = true;
      await this.create(taskId);
    }

    const owned = await this.read();
    return {
      recoveredStaleLock,
      release: async () => {
        const current = await this.read();
        if (current.nonce !== owned.nonce || current.pid !== owned.pid) {
          throw new RepositoryLockError(
            'repository-lock-ownership',
            'Repository lock ownership changed before release.',
          );
        }
        await unlink(this.path);
      },
    };
  }

  private async create(taskId: string): Promise<void> {
    const lock: RepositoryLock = {
      schemaVersion: 1,
      taskId,
      pid: this.pid,
      acquiredAt: this.now(),
      nonce: randomUUID(),
    };
    await writeFile(this.path, `${JSON.stringify(lock, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
  }

  private async read(): Promise<RepositoryLock> {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(this.path, 'utf8'));
    } catch {
      throw new RepositoryLockError('repository-lock-invalid', 'Repository lock is unreadable.');
    }
    if (
      !isObject(value) ||
      value.schemaVersion !== 1 ||
      typeof value.taskId !== 'string' ||
      !Number.isSafeInteger(value.pid) ||
      typeof value.pid !== 'number' ||
      value.pid <= 0 ||
      typeof value.acquiredAt !== 'string' ||
      Number.isNaN(Date.parse(value.acquiredAt)) ||
      typeof value.nonce !== 'string' ||
      value.nonce.length === 0
    ) {
      throw new RepositoryLockError('repository-lock-invalid', 'Repository lock is invalid.');
    }
    assertTaskId(value.taskId);
    return {
      schemaVersion: 1,
      taskId: value.taskId,
      pid: value.pid,
      acquiredAt: value.acquiredAt,
      nonce: value.nonce,
    };
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return !isProcessMissing(error);
  }
}

function assertTaskId(taskId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(taskId)) {
    throw new RepositoryLockError('task-id-invalid', 'Task ID is invalid.');
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

function isProcessMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH';
}
