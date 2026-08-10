import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { GitRepository, RepositoryChange } from './git-repository';
import { TaskService, type TaskPreflightError } from './task-service';
import type { TaskState, TaskStateStore } from './task-state';

describe('task service', () => {
  it('captures pre-existing ownership and passes an in-scope committed change', async () => {
    const fixture = await taskFixture();
    fixture.repository.worktree = [change('docs/user-note.md', 'untracked')];
    fixture.repository.fingerprints.set('docs/user-note.md', 'old');

    const started = await fixture.service.begin(fixture.planPath);
    fixture.repository.committed = [change('libs/features/users/me.ts', 'committed')];
    fixture.repository.fingerprints.set('libs/features/users/me.ts', 'new');
    const result = await fixture.service.preflight(started.taskId, 'verify');

    expect(result.taskPaths).toEqual(['libs/features/users/me.ts']);
    expect(result.preexistingPaths).toEqual(['docs/user-note.md']);
    expect(result.controllerArtifactPaths).toEqual([]);
    expect(result.classification.effectiveRisk).toBe('medium');
  });

  it('reports exact untracked verification outputs separately from task ownership', async () => {
    const fixture = await taskFixture();
    const started = await fixture.service.begin(fixture.planPath);
    fixture.repository.worktree = [change('_WIP/duplication-report.md', 'untracked')];

    const result = await fixture.service.preflight(started.taskId, 'verify');

    expect(result.taskPaths).toEqual([]);
    expect(result.controllerArtifactPaths).toEqual(['_WIP/duplication-report.md']);
  });

  it('treats later edits to pre-existing paths as task-owned and enforces scope', async () => {
    const fixture = await taskFixture();
    fixture.repository.worktree = [change('docs/user-note.md', 'untracked')];
    fixture.repository.fingerprints.set('docs/user-note.md', 'old');
    const started = await fixture.service.begin(fixture.planPath);
    fixture.repository.fingerprints.set('docs/user-note.md', 'changed');

    await expect(fixture.service.preflight(started.taskId, 'verify')).rejects.toMatchObject<
      Partial<TaskPreflightError>
    >({ code: 'scope-violation' });
  });

  it('rejects authority drift and unauthorized actions', async () => {
    const fixture = await taskFixture();
    const started = await fixture.service.begin(fixture.planPath);

    await expect(fixture.service.preflight(started.taskId, 'commit')).rejects.toThrow(
      "does not authorize 'commit'",
    );
    await writeFile(
      join(fixture.root, fixture.planPath),
      planSource().replace('Repair limit:** 2', 'Repair limit:** 3'),
    );
    await expect(fixture.service.preflight(started.taskId, 'verify')).rejects.toMatchObject<
      Partial<TaskPreflightError>
    >({ code: 'authority-changed' });
  });

  it('rejects effective risk above the human-authorized maximum', async () => {
    const fixture = await taskFixture(
      planSource({ paths: 'tools/backendkit/', risk: 'low', maximumRisk: 'medium' }),
    );
    const started = await fixture.service.begin(fixture.planPath);
    fixture.repository.worktree = [change('tools/backendkit/new.ts', 'untracked')];
    fixture.repository.fingerprints.set('tools/backendkit/new.ts', 'new');

    await expect(fixture.service.preflight(started.taskId, 'verify')).rejects.toMatchObject<
      Partial<TaskPreflightError>
    >({ code: 'risk-above-authority' });
  });

  it('allows an explicitly authorized handoff only after successful verification state', async () => {
    const fixture = await taskFixture(planSource({ actions: 'edit, verify, commit' }));
    const started = await fixture.service.begin(fixture.planPath);
    const authorized = await fixture.states.read();
    await fixture.states.write({ ...authorized, status: 'ready_for_review', attempt: 1 });
    fixture.repository.worktree = [change('libs/features/users/me.ts', 'unstaged')];
    fixture.repository.fingerprints.set('libs/features/users/me.ts', 'verified');

    await expect(fixture.service.preflight(started.taskId, 'commit')).rejects.toMatchObject<
      Partial<TaskPreflightError>
    >({ code: 'state-not-authorized' });
    await expect(fixture.service.handoffPreflight(started.taskId, 'commit')).resolves.toMatchObject(
      {
        action: 'commit',
        taskPaths: ['libs/features/users/me.ts'],
      },
    );
  });
});

class FakeGitRepository implements GitRepository {
  worktree: ReadonlyArray<RepositoryChange> = [];
  committed: ReadonlyArray<RepositoryChange> = [];
  fingerprints = new Map<string, string>();

  async head(): Promise<string> {
    return 'a'.repeat(40);
  }

  async worktreeChanges(): Promise<ReadonlyArray<RepositoryChange>> {
    return this.worktree;
  }

  async changesSince(): Promise<ReadonlyArray<RepositoryChange>> {
    return this.committed;
  }

  async contentFingerprint(path: string): Promise<string> {
    return this.fingerprints.get(path) ?? '0'.repeat(64);
  }
}

class MemoryStateStore implements TaskStateStore {
  state?: TaskState;

  async create(state: TaskState): Promise<void> {
    if (this.state) throw new Error('state exists');
    this.state = state;
  }

  async read(): Promise<TaskState> {
    if (!this.state) throw new Error('state missing');
    return this.state;
  }

  async write(state: TaskState): Promise<void> {
    this.state = state;
  }
}

async function taskFixture(source = planSource()): Promise<
  Readonly<{
    root: string;
    planPath: string;
    repository: FakeGitRepository;
    states: MemoryStateStore;
    service: TaskService;
  }>
> {
  const root = await mkdtemp(join(tmpdir(), 'backendkit-service-'));
  const planPath = 'docs/exec-plans/active/example.md';
  await mkdir(join(root, 'docs', 'exec-plans', 'active'), { recursive: true });
  await mkdir(join(root, 'libs', 'features', 'users'), { recursive: true });
  await mkdir(join(root, 'tools', 'backendkit'), { recursive: true });
  await writeFile(join(root, planPath), source);
  const repository = new FakeGitRepository();
  const states = new MemoryStateStore();
  const service = new TaskService(root, repository, states, () => '2026-08-09T00:00:00.000Z');
  return { root, planPath, repository, states, service };
}

function change(path: string, source: RepositoryChange['sources'][number]): RepositoryChange {
  return { path, sources: [source] };
}

function planSource(
  values: Readonly<{
    paths?: string;
    risk?: string;
    maximumRisk?: string;
    actions?: string;
  }> = {},
): string {
  return `# Example

**Plan version:** 2
**Task ID:** example-task
**Status:** active
**Owner:** test owner
**Risk:** ${values.risk ?? 'medium'}
**Authority:** edit and verify locally
**Allowed paths:** ${values.paths ?? 'libs/features/users/'}
**Allowed actions:** ${values.actions ?? 'edit, verify'}
**Maximum risk:** ${values.maximumRisk ?? 'high'}
**Repair limit:** 2
**Task timeout:** 90m

## Impact Areas

- API/OpenAPI: no
- DB/Prisma/migrations: no
- Auth/session/RBAC: no
- Queue/jobs: no
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: no
- CI/release/harness: no
`;
}
