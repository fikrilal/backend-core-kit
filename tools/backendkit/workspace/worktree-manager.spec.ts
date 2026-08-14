import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runProcess } from '../process-runner';
import { SystemWorktreeManager } from './worktree-manager';
import type { WorktreeError } from './worktree-manager';

describe('task worktree manager', () => {
  it('isolates candidate changes and refuses destructive dirty cleanup', async () => {
    const root = await repositoryFixture();
    const base = (await git(root, ['rev-parse', 'HEAD'])).trim();
    const manager = new SystemWorktreeManager(root);
    const descriptor = await manager.prepare('isolation-task', base);

    expect(descriptor.path.startsWith(join(root, '.tmp', 'backendkit', 'worktrees'))).toBe(true);
    await writeFile(join(descriptor.path, 'candidate.txt'), 'candidate');
    expect(await git(root, ['status', '--porcelain=v1'])).toBe('');
    await expect(manager.cleanup(descriptor)).rejects.toMatchObject<Partial<WorktreeError>>({
      code: 'worktree-dirty',
    });

    await rm(join(descriptor.path, 'candidate.txt'));
    await manager.cleanup(descriptor);
    expect(
      (await git(root, ['show-ref', '--verify', `refs/heads/${descriptor.branch}`])).trim(),
    ).not.toBe('');
    await rm(root, { recursive: true, force: true });
  });
});

async function repositoryFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'backendkit-worktree-'));
  await git(root, ['init', '--quiet']);
  await git(root, ['config', 'user.email', 'fixture@example.test']);
  await git(root, ['config', 'user.name', 'Fixture']);
  await writeFile(join(root, 'README.md'), 'fixture\n');
  await writeFile(join(root, '.gitignore'), '.tmp/\n');
  await git(root, ['add', 'README.md', '.gitignore']);
  await git(root, ['commit', '--quiet', '-m', 'fixture']);
  return root;
}

async function git(root: string, args: ReadonlyArray<string>): Promise<string> {
  const result = await runProcess({ command: 'git', args, cwd: root, stdio: 'pipe' });
  if (result.code !== 0) throw new Error(result.stderr);
  return result.stdout;
}
