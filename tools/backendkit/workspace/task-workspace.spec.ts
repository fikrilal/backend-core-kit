import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RiskClassification } from '../policy/risk-classifier';
import type { TaskPreflightResult } from '../task/task-service';
import { transitionTask, type TaskState, type TaskStateStore } from '../task/task-state';
import type { RepositoryLockLease, RepositoryLockStore } from './repository-lock';
import {
  FileTaskWorkspaceStore,
  TaskWorkspaceService,
  validateTaskWorkspace,
  type TaskWorkspace,
  type TaskWorkspaceStore,
  type WorkspacePreflightService,
} from './task-workspace';
import type { WorktreeDescriptor, WorktreeManager } from './worktree-manager';

describe('TaskWorkspaceService', () => {
  it('prepares an isolated workspace for the current agent and restores authorized state', async () => {
    const fixture = await workspaceFixture();

    const result = await fixture.service.prepare(fixture.state.taskId);

    expect(result.path).toBe(fixture.worktree.path);
    expect(fixture.states.state.status).toBe('authorized');
    expect(fixture.states.state.transitions.map(({ reason }) => reason)).toEqual([
      'task.begin',
      'workspace.preparing',
      'workspace.prepared',
    ]);
    expect(await readFile(join(fixture.worktree.path, fixture.state.planPath), 'utf8')).toContain(
      '# Current session task',
    );
    await expect(fixture.service.resolveCandidateRoot(fixture.state.taskId)).resolves.toBe(
      fixture.worktree.path,
    );
    await expect(fixture.service.status(fixture.state.taskId)).resolves.toMatchObject({
      status: 'authorized',
      branch: fixture.worktree.branch,
    });
  });

  it('records cancellation without controlling an agent process', async () => {
    const fixture = await workspaceFixture();
    await fixture.service.prepare(fixture.state.taskId);

    const result = await fixture.service.cancel(fixture.state.taskId);

    expect(result.status).toBe('cancelled');
    expect(fixture.states.state.transitions.at(-1)?.reason).toBe('workspace.cancelled');
  });

  it('cleans only stopped work and delegates dirty-worktree protection', async () => {
    const fixture = await workspaceFixture();
    await fixture.service.prepare(fixture.state.taskId);
    fixture.states.state = transitionTask(
      fixture.states.state,
      'ready_for_review',
      '2026-08-09T00:02:00.000Z',
      'task.verify.passed',
    );

    await fixture.service.cleanup(fixture.state.taskId);

    expect(fixture.worktrees.cleaned).toEqual([fixture.worktree]);
    expect(fixture.workspaces.workspace).toBeUndefined();
  });
});

describe('FileTaskWorkspaceStore', () => {
  it('stores strict private adapter-neutral workspace metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backendkit-workspace-state-'));
    const store = new FileTaskWorkspaceStore(root);
    const workspace = workspaceState();

    await store.create(workspace);

    await expect(store.read(workspace.taskId)).resolves.toEqual(workspace);
    const path = join(root, '.tmp', 'backendkit', 'tasks', workspace.taskId, 'workspace.json');
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await readFile(path, 'utf8')).not.toMatch(/prompt|model|stdout|stderr|pid|token/i);
  });

  it('rejects process and model fields', () => {
    expect(() => validateTaskWorkspace({ ...workspaceState(), childPid: 123 })).toThrow('invalid');
    expect(() => validateTaskWorkspace({ ...workspaceState(), model: 'codex' })).toThrow('invalid');
  });
});

class MemoryStateStore implements TaskStateStore {
  constructor(public state: TaskState) {}

  async create(state: TaskState): Promise<void> {
    this.state = state;
  }

  async read(): Promise<TaskState> {
    return this.state;
  }

  async write(state: TaskState): Promise<void> {
    this.state = state;
  }
}

class MemoryWorkspaceStore implements TaskWorkspaceStore {
  workspace?: TaskWorkspace;

  async create(workspace: TaskWorkspace): Promise<void> {
    this.workspace = workspace;
  }

  async read(): Promise<TaskWorkspace> {
    if (!this.workspace) throw new Error('workspace missing');
    return this.workspace;
  }

  async delete(): Promise<void> {
    this.workspace = undefined;
  }
}

class FakeLockStore implements RepositoryLockStore {
  async acquire(): Promise<RepositoryLockLease> {
    return { recoveredStaleLock: false, release: async () => undefined };
  }
}

class FakeWorktrees implements WorktreeManager {
  readonly cleaned: WorktreeDescriptor[] = [];

  constructor(readonly descriptor: WorktreeDescriptor) {}

  async prepare(): Promise<WorktreeDescriptor> {
    return this.descriptor;
  }

  async validate(): Promise<void> {}

  async cleanup(worktree: WorktreeDescriptor): Promise<void> {
    this.cleaned.push(worktree);
  }
}

class FakeTasks implements WorkspacePreflightService {
  constructor(private readonly result: TaskPreflightResult) {}

  async preflight(): Promise<TaskPreflightResult> {
    return this.result;
  }
}

async function workspaceFixture() {
  const root = await mkdtemp(join(tmpdir(), 'backendkit-current-agent-'));
  const worktreePath = await mkdtemp(join(tmpdir(), 'backendkit-current-agent-worktree-'));
  const planPath = 'docs/exec-plans/active/current-session.md';
  await mkdir(join(root, 'docs', 'exec-plans', 'active'), { recursive: true });
  await writeFile(join(root, planPath), '# Current session task\n');
  const state = taskState(planPath);
  const states = new MemoryStateStore(state);
  const workspaces = new MemoryWorkspaceStore();
  const worktree: WorktreeDescriptor = {
    repositoryIdentity: 'b'.repeat(64),
    path: worktreePath,
    branch: `backendkit/${state.taskId}`,
    baseRevision: state.baseRevision,
  };
  const worktrees = new FakeWorktrees(worktree);
  const service = new TaskWorkspaceService(root, {
    states,
    workspaces,
    locks: new FakeLockStore(),
    worktrees,
    tasks: new FakeTasks(preflight(state)),
    now: () => '2026-08-09T00:01:00.000Z',
  });
  return { root, state, states, workspaces, worktree, worktrees, service };
}

function taskState(planPath: string): TaskState {
  return {
    schemaVersion: 2,
    authoritySchemaVersion: 2,
    taskId: 'current-agent-task',
    status: 'authorized',
    startedAt: '2026-08-09T00:00:00.000Z',
    baseRevision: 'a'.repeat(40),
    planPath,
    planSourceHash: 'b'.repeat(64),
    authorityHash: 'c'.repeat(64),
    declaredRisk: 'high',
    boundaries: {
      allowedPaths: [planPath, 'candidate.txt'],
      allowedActions: ['edit', 'verify'],
      maximumRisk: 'high',
      repairLimit: 2,
      timeoutMs: 3_600_000,
    },
    preexistingChanges: [],
    attempt: 0,
    transitions: [
      { status: 'authorized', occurredAt: '2026-08-09T00:00:00.000Z', reason: 'task.begin' },
    ],
    failures: [],
  };
}

function preflight(state: TaskState): TaskPreflightResult {
  const classification: RiskClassification = {
    declaredRisk: 'high',
    pathRisk: 'low',
    effectiveRisk: 'high',
    paths: [],
    reasons: [],
  };
  return {
    taskId: state.taskId,
    action: 'edit',
    taskPaths: [],
    preexistingPaths: [],
    controllerArtifactPaths: [],
    classification,
    impacts: {
      api: false,
      database: false,
      auth: false,
      queue: false,
      environment: false,
      observability: false,
      externalIntegrations: false,
      harness: true,
    },
    taskFingerprint: 'd'.repeat(64),
    planPath: state.planPath,
    authorityHash: state.authorityHash,
  };
}

function workspaceState(): TaskWorkspace {
  return {
    schemaVersion: 1,
    taskId: 'current-agent-task',
    planPath: 'docs/exec-plans/active/current-session.md',
    authorityHash: 'a'.repeat(64),
    preparedAt: '2026-08-09T00:00:00.000Z',
    worktree: {
      repositoryIdentity: 'b'.repeat(64),
      path: '/tmp/current-agent-task',
      branch: 'backendkit/current-agent-task',
      baseRevision: 'c'.repeat(40),
    },
  };
}
