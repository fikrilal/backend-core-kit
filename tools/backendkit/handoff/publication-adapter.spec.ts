import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ProcessRequest, ProcessResult, ProcessRunner } from '../process-runner';
import { runProcess } from '../process-runner';
import { parseRemote, SystemPublicationAdapter } from './publication-adapter';

describe('SystemPublicationAdapter', () => {
  it('accepts credential-free origin forms and rejects embedded credentials', () => {
    expect(parseRemote('git@github.com:example/backend.git')).toBe('github.com/example/backend');
    expect(parseRemote('https://github.com/example/backend.git')).toBe(
      'github.com/example/backend',
    );
    expect(() => parseRemote('https://token@github.com/example/backend.git')).toThrow(
      'credential-free',
    );
  });

  it('uses a normal explicit-ref push with no force option', async () => {
    const runner = new GitHubRunner();
    const adapter = new SystemPublicationAdapter('/candidate', runner);

    await expect(adapter.push('backendkit/handoff-task')).resolves.toBe('a'.repeat(40));

    const push = runner.requests.find(({ args }) => args[0] === 'push');
    expect(push?.args).toEqual([
      'push',
      'origin',
      'refs/heads/backendkit/handoff-task:refs/heads/backendkit/handoff-task',
    ]);
    expect(push?.args.some((argument) => argument.includes('force'))).toBe(false);
  });

  it('creates a draft PR with explicit repository, head, and base', async () => {
    const runner = new GitHubRunner();
    const adapter = new SystemPublicationAdapter('/candidate', runner);

    await expect(
      adapter.createDraftPr({
        branch: 'backendkit/handoff-task',
        base: 'development',
        title: 'Verified handoff',
        bodyPath: '/tmp/body.md',
      }),
    ).resolves.toBe('https://github.com/example/backend/pull/42');

    const gh = runner.requests.find(({ command }) => command === 'gh');
    expect(gh?.args).toEqual([
      'pr',
      'create',
      '--draft',
      '--repo',
      'github.com/example/backend',
      '--head',
      'backendkit/handoff-task',
      '--base',
      'development',
      '--title',
      'Verified handoff',
      '--body-file',
      '/tmp/body.md',
      '--no-maintainer-edit',
    ]);
  });

  it('stages exact paths and creates a normal commit in a real repository', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backendkit-publication-'));
    try {
      await git(root, ['init', '-b', 'backendkit/integration-task']);
      await git(root, ['config', 'user.name', 'Backendkit Fixture']);
      await git(root, ['config', 'user.email', 'backendkit@example.invalid']);
      await git(root, ['remote', 'add', 'origin', 'git@github.com:example/backend.git']);
      await writeFile(join(root, 'candidate.ts'), 'export const value = 1;\n');
      await git(root, ['add', '--', 'candidate.ts']);
      await git(root, ['commit', '-m', 'test: establish fixture']);
      await writeFile(join(root, 'candidate.ts'), 'export const value = 2;\n');

      const adapter = new SystemPublicationAdapter(root);
      const before = await adapter.inspect();
      expect(before.stagedPaths).toEqual([]);
      expect(before.worktreePaths).toEqual(['candidate.ts']);

      await adapter.stage(['candidate.ts']);
      const staged = await adapter.inspect();
      expect(staged.stagedPaths).toEqual(['candidate.ts']);

      const revision = await adapter.commit('test: publish candidate');
      expect(revision).toMatch(/^[0-9a-f]{40}$/);
      await expect(adapter.inspect()).resolves.toMatchObject({
        stagedPaths: [],
        worktreePaths: [],
        head: revision,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function git(root: string, args: ReadonlyArray<string>): Promise<void> {
  const result = await runProcess({ command: 'git', args, cwd: root, stdio: 'pipe' });
  if (result.code !== 0) throw new Error(`Git fixture failed: ${result.stderr}`);
}

class GitHubRunner implements ProcessRunner {
  readonly requests: ProcessRequest[] = [];

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.requests.push(request);
    const first = request.args[0];
    let stdout = '';
    if (request.command === 'gh') stdout = 'https://github.com/example/backend/pull/42\n';
    else if (first === 'branch') stdout = 'backendkit/handoff-task\n';
    else if (first === 'remote') stdout = 'git@github.com:example/backend.git\n';
    else if (first === 'rev-parse') stdout = `${'a'.repeat(40)}\n`;
    return {
      command: request.command,
      args: request.args,
      code: 0,
      signal: null,
      timedOut: false,
      durationMs: 1,
      stdout,
      stderr: '',
    };
  }
}
