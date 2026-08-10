import type { ProcessRunner } from '../process-runner';
import { systemProcessRunner } from '../process-runner';
import { SystemGitRepository } from '../task/git-repository';

export type PublicationRepositoryState = Readonly<{
  branch: string;
  remote: string;
  head: string;
  stagedPaths: ReadonlyArray<string>;
  worktreePaths: ReadonlyArray<string>;
}>;

export interface PublicationAdapter {
  inspect(): Promise<PublicationRepositoryState>;
  stage(paths: ReadonlyArray<string>): Promise<void>;
  commit(message: string): Promise<string>;
  push(branch: string): Promise<string>;
  createDraftPr(
    input: Readonly<{ branch: string; base: string; title: string; bodyPath: string }>,
  ): Promise<string>;
}

export class PublicationAdapterError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PublicationAdapterError';
  }
}

export class SystemPublicationAdapter implements PublicationAdapter {
  private readonly repository: SystemGitRepository;

  constructor(
    private readonly root: string,
    private readonly runner: ProcessRunner = systemProcessRunner,
  ) {
    this.repository = new SystemGitRepository(root, runner);
  }

  async inspect(): Promise<PublicationRepositoryState> {
    const branch = (await this.git(['branch', '--show-current'])).trim();
    if (!/^backendkit\/[a-z0-9-]+$/.test(branch)) {
      throw new PublicationAdapterError(
        'handoff-branch-invalid',
        'Publication requires a backendkit task branch.',
      );
    }
    const remote = parseRemote((await this.git(['remote', 'get-url', 'origin'])).trim());
    const stagedPaths = splitPaths(await this.git(['diff', '--cached', '--name-only', '-z']));
    const worktreePaths = (await this.repository.worktreeChanges()).map(({ path }) => path);
    return {
      branch,
      remote,
      head: await this.repository.head(),
      stagedPaths,
      worktreePaths,
    };
  }

  async stage(paths: ReadonlyArray<string>): Promise<void> {
    if (paths.length === 0) {
      throw new PublicationAdapterError(
        'handoff-paths-empty',
        'No task paths are available to stage.',
      );
    }
    await this.git(['add', '--', ...paths]);
  }

  async commit(message: string): Promise<string> {
    validateText(message, 'commit message', 200);
    await this.git(['commit', '-m', message]);
    return await this.repository.head();
  }

  async push(branch: string): Promise<string> {
    validateBranch(branch);
    await this.git(['push', 'origin', `refs/heads/${branch}:refs/heads/${branch}`]);
    return await this.repository.head();
  }

  async createDraftPr(
    input: Readonly<{
      branch: string;
      base: string;
      title: string;
      bodyPath: string;
    }>,
  ): Promise<string> {
    validateBranch(input.branch);
    validateBase(input.base);
    validateText(input.title, 'pull request title', 200);
    if (!input.bodyPath.startsWith('/')) {
      throw new PublicationAdapterError(
        'handoff-body-path-invalid',
        'Draft PR body path must be absolute.',
      );
    }
    const state = await this.inspect();
    const result = await this.run('gh', [
      'pr',
      'create',
      '--draft',
      '--repo',
      state.remote,
      '--head',
      input.branch,
      '--base',
      input.base,
      '--title',
      input.title,
      '--body-file',
      input.bodyPath,
      '--no-maintainer-edit',
    ]);
    const url = result.trim();
    if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+$/.test(url)) {
      throw new PublicationAdapterError(
        'handoff-pr-result-invalid',
        'GitHub CLI returned an invalid pull request URL.',
      );
    }
    return url;
  }

  private async git(args: ReadonlyArray<string>): Promise<string> {
    return await this.run('git', args);
  }

  private async run(command: string, args: ReadonlyArray<string>): Promise<string> {
    const result = await this.runner.run({
      command,
      args,
      cwd: this.root,
      stdio: 'pipe',
      timeoutMs: 2 * 60_000,
    });
    if (result.code !== 0 || result.signal || result.timedOut) {
      throw new PublicationAdapterError(
        'handoff-command-failed',
        `${command} ${args[0] ?? 'command'} failed.`,
      );
    }
    return result.stdout;
  }
}

export function parseRemote(value: string): string {
  const scp = /^git@([a-z0-9.-]+):([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/i.exec(value);
  if (scp) return `${scp[1]?.toLowerCase()}/${scp[2]}/${scp[3]}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PublicationAdapterError('handoff-remote-invalid', 'Origin remote is invalid.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new PublicationAdapterError(
      'handoff-remote-invalid',
      'Origin remote must be credential-free HTTPS or git@host SCP syntax.',
    );
  }
  const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url.pathname);
  if (!match)
    throw new PublicationAdapterError('handoff-remote-invalid', 'Origin remote is invalid.');
  return `${url.hostname.toLowerCase()}/${match[1]}/${match[2]}`;
}

function splitPaths(value: string): ReadonlyArray<string> {
  return value
    .split('\0')
    .filter((path) => path.length > 0)
    .sort();
}

function validateBranch(value: string): void {
  if (!/^backendkit\/[a-z0-9-]+$/.test(value)) {
    throw new PublicationAdapterError('handoff-branch-invalid', 'Task branch is invalid.');
  }
}

function validateBase(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(value) || value.includes('..')) {
    throw new PublicationAdapterError(
      'handoff-base-invalid',
      'Pull request base branch is invalid.',
    );
  }
}

function validateText(value: string, label: string, maximum: number): void {
  if (
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximum ||
    /[\r\n\0]/.test(value)
  ) {
    throw new PublicationAdapterError('handoff-text-invalid', `${label} is invalid.`);
  }
}
