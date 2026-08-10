import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FileRepositoryLockStore } from './repository-lock';
import type { RepositoryLockError } from './repository-lock';

describe('workspace repository command lock', () => {
  it('enforces single-flight ownership and releases its own lease', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backendkit-lock-'));
    const store = new FileRepositoryLockStore(root);
    const lease = await store.acquire('first-task');

    await expect(store.acquire('second-task')).rejects.toMatchObject<Partial<RepositoryLockError>>({
      code: 'repository-locked',
    });
    await lease.release();
    const secondLease = await store.acquire('second-task');
    await secondLease.release();
  });

  it('requires explicit recovery and proof that a stale owner is gone', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backendkit-lock-stale-'));
    const lockPath = join(root, '.tmp', 'backendkit', 'repository-lock.json');
    await mkdir(join(root, '.tmp', 'backendkit'), { recursive: true });
    await writeFile(
      lockPath,
      JSON.stringify({
        schemaVersion: 1,
        taskId: 'stale-task',
        pid: 2_147_483_647,
        acquiredAt: '2026-08-09T00:00:00.000Z',
        nonce: 'stale',
      }),
    );
    const store = new FileRepositoryLockStore(root);

    await expect(store.acquire('next-task')).rejects.toMatchObject<Partial<RepositoryLockError>>({
      code: 'repository-lock-stale',
    });
    const lease = await store.acquire('next-task', true);
    expect(lease.recoveredStaleLock).toBe(true);
    await lease.release();
  });
});
