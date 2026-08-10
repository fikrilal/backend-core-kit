import { createHash } from 'node:crypto';
import { lstat, readFile, readlink } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ProcessRunner } from '../process-runner';
import { systemProcessRunner } from '../process-runner';
import { normalizeRepositoryPath } from './task-plan';

export type RepositoryChange = Readonly<{
  path: string;
  sources: ReadonlyArray<'committed' | 'staged' | 'unstaged' | 'untracked'>;
}>;

export interface GitRepository {
  head(): Promise<string>;
  worktreeChanges(): Promise<ReadonlyArray<RepositoryChange>>;
  changesSince(baseRevision: string): Promise<ReadonlyArray<RepositoryChange>>;
  contentFingerprint(path: string): Promise<string>;
}

export class SystemGitRepository implements GitRepository {
  constructor(
    private readonly root: string,
    private readonly runner: ProcessRunner = systemProcessRunner,
  ) {}

  async head(): Promise<string> {
    const output = await this.git(['rev-parse', '--verify', 'HEAD']);
    const revision = output.trim();
    if (!/^[0-9a-f]{40,64}$/.test(revision))
      throw new Error('Git returned an invalid HEAD revision.');
    return revision;
  }

  async worktreeChanges(): Promise<ReadonlyArray<RepositoryChange>> {
    const output = await this.git(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    const entries = output.split('\0');
    const changes = new Map<string, Set<RepositoryChange['sources'][number]>>();

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry) continue;
      const x = entry[0];
      const y = entry[1];
      const path = entry.slice(3);
      addStatus(changes, path, x, y);
      if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
        const originalPath = entries[index + 1];
        if (originalPath) addStatus(changes, originalPath, x, y);
        index += 1;
      }
    }

    return mapChanges(changes);
  }

  async changesSince(baseRevision: string): Promise<ReadonlyArray<RepositoryChange>> {
    if (!/^[0-9a-f]{40,64}$/.test(baseRevision)) throw new Error('Invalid task base revision.');
    const output = await this.git([
      'diff',
      '--name-only',
      '--diff-filter=ACMRDT',
      '-z',
      baseRevision,
      'HEAD',
      '--',
    ]);
    return output
      .split('\0')
      .filter((path) => path.length > 0)
      .map((path) => ({ path: normalizeRepositoryPath(path), sources: ['committed'] }));
  }

  async contentFingerprint(path: string): Promise<string> {
    const normalized = normalizeRepositoryPath(path);
    const absolutePath = resolve(this.root, normalized);
    try {
      const stats = await lstat(absolutePath);
      if (stats.isSymbolicLink()) return hash(`symlink:${await readlink(absolutePath)}`);
      if (!stats.isFile()) return hash(`other:${stats.mode}:${stats.size}`);
      return hash(await readFile(absolutePath));
    } catch (error: unknown) {
      if (isMissing(error)) return hash('missing');
      throw error;
    }
  }

  private async git(args: ReadonlyArray<string>): Promise<string> {
    const result = await this.runner.run({
      command: 'git',
      args,
      cwd: this.root,
      stdio: 'pipe',
    });
    if (result.code !== 0 || result.signal || result.timedOut) {
      throw new Error(
        `Git command failed: ${result.stderr.trim() || args[0] || 'unknown operation'}`,
      );
    }
    return result.stdout;
  }
}

export function mergeChanges(
  ...groups: ReadonlyArray<ReadonlyArray<RepositoryChange>>
): ReadonlyArray<RepositoryChange> {
  const merged = new Map<string, Set<RepositoryChange['sources'][number]>>();
  for (const group of groups) {
    for (const change of group) {
      const sources = merged.get(change.path) ?? new Set<RepositoryChange['sources'][number]>();
      for (const source of change.sources) sources.add(source);
      merged.set(change.path, sources);
    }
  }
  return mapChanges(merged);
}

function addStatus(
  changes: Map<string, Set<RepositoryChange['sources'][number]>>,
  path: string,
  x: string | undefined,
  y: string | undefined,
): void {
  const normalized = normalizeRepositoryPath(path);
  const sources = changes.get(normalized) ?? new Set<RepositoryChange['sources'][number]>();
  if (x === '?' && y === '?') sources.add('untracked');
  else {
    if (x && x !== ' ' && x !== '?') sources.add('staged');
    if (y && y !== ' ' && y !== '?') sources.add('unstaged');
  }
  changes.set(normalized, sources);
}

function mapChanges(
  changes: Map<string, Set<RepositoryChange['sources'][number]>>,
): ReadonlyArray<RepositoryChange> {
  return [...changes.entries()]
    .map(([path, sources]) => ({ path, sources: [...sources].sort() }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function hash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
