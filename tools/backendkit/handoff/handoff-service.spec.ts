import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TaskEpisode } from '../evidence/episode';
import type { RiskClassification } from '../policy/risk-classifier';
import type { TaskPreflightResult } from '../task/task-service';
import type { TaskState, TaskStateStore } from '../task/task-state';
import type { RepositoryLockLease, RepositoryLockStore } from '../workspace/repository-lock';
import type { TaskWorkspaceResult } from '../workspace/task-workspace';
import type { HandoffApproval, HandoffApprovalStore, PublicationAction } from './handoff-approval';
import { HandoffService } from './handoff-service';
import type { PublicationAdapter, PublicationRepositoryState } from './publication-adapter';

describe('HandoffService', () => {
  it('stages exact verified paths and creates one normal commit after dry-run approval', async () => {
    const fixture = await handoffFixture('commit');
    const dryRun = await fixture.service.dryRun(fixture.state.taskId, 'commit');

    const result = await fixture.service.commit(
      fixture.state.taskId,
      dryRun.approval,
      'feat(harness): publish fixture',
    );

    expect(result.outcome).toBe('d'.repeat(40));
    expect(fixture.adapter.stageCalls).toEqual([['candidate.ts']]);
    expect(fixture.adapter.commits).toEqual(['feat(harness): publish fixture']);
    expect(fixture.approvals.value?.status).toBe('completed');
  });

  it('refuses stale verification before creating an approval', async () => {
    const fixture = await handoffFixture('commit', { episodeFingerprint: 'e'.repeat(64) });

    await expect(fixture.service.dryRun(fixture.state.taskId, 'commit')).rejects.toThrow(
      'does not match current task content',
    );
    expect(fixture.approvals.value).toBeUndefined();
  });

  it('expires one-action approval and never infers another action', async () => {
    let current = '2026-08-10T00:00:00.000Z';
    const fixture = await handoffFixture('commit', { now: () => current });
    const dryRun = await fixture.service.dryRun(fixture.state.taskId, 'commit');
    current = '2026-08-10T00:16:00.000Z';

    await expect(
      fixture.service.commit(fixture.state.taskId, dryRun.approval, 'chore: expired'),
    ).rejects.toThrow('approval expired');
    await expect(fixture.service.push(fixture.state.taskId, dryRun.approval)).rejects.toThrow(
      "Prepare a fresh 'push' dry-run",
    );
  });

  it('marks an interrupted mutation uncertain and refuses automatic retry', async () => {
    const fixture = await handoffFixture('commit');
    fixture.adapter.failCommit = true;
    const dryRun = await fixture.service.dryRun(fixture.state.taskId, 'commit');

    await expect(
      fixture.service.commit(fixture.state.taskId, dryRun.approval, 'chore: uncertain'),
    ).rejects.toThrow('inspect local and remote state');
    expect(fixture.approvals.value?.status).toBe('uncertain');
    await expect(
      fixture.service.commit(fixture.state.taskId, dryRun.approval, 'chore: retry'),
    ).rejects.toThrow("Prepare a fresh 'commit' dry-run");
  });

  it('creates only a draft PR from a clean committed candidate and marks handoff', async () => {
    const fixture = await handoffFixture('draft-pr', { clean: true });
    const dryRun = await fixture.service.dryRun(fixture.state.taskId, 'draft-pr');

    const result = await fixture.service.draftPr(
      fixture.state.taskId,
      dryRun.approval,
      'development',
      'Verified fixture',
    );

    expect(result.outcome).toBe('https://github.com/example/backend/pull/42');
    expect(fixture.adapter.draftInputs).toHaveLength(1);
    const bodyPath = fixture.adapter.draftInputs[0]?.bodyPath;
    if (!bodyPath) throw new Error('Expected draft body path.');
    const body = await readFile(bodyPath, 'utf8');
    expect(body).toContain('Verified handoff');
    expect(body).not.toMatch(/prompt|stdout|stderr|token/i);
    expect(fixture.states.state.status).toBe('handed_off');
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

class MemoryApprovalStore implements HandoffApprovalStore {
  value?: HandoffApproval;

  async read(_taskId: string, action: PublicationAction): Promise<HandoffApproval | undefined> {
    return this.value?.action === action ? this.value : undefined;
  }

  async write(approval: HandoffApproval): Promise<void> {
    this.value = approval;
  }
}

class FakeLockStore implements RepositoryLockStore {
  async acquire(): Promise<RepositoryLockLease> {
    return { recoveredStaleLock: false, release: async () => undefined };
  }
}

class FakeAdapter implements PublicationAdapter {
  staged: ReadonlyArray<string> = [];
  stageCalls: ReadonlyArray<ReadonlyArray<string>> = [];
  worktree: ReadonlyArray<string>;
  commits: string[] = [];
  pushes: string[] = [];
  draftInputs: Array<Readonly<{ branch: string; base: string; title: string; bodyPath: string }>> =
    [];
  failCommit = false;

  constructor(clean: boolean) {
    this.worktree = clean ? [] : ['candidate.ts'];
  }

  async inspect(): Promise<PublicationRepositoryState> {
    return {
      branch: 'backendkit/handoff-task',
      remote: 'github.com/example/backend',
      head: 'b'.repeat(40),
      stagedPaths: this.staged,
      worktreePaths: this.worktree,
    };
  }

  async stage(paths: ReadonlyArray<string>): Promise<void> {
    this.stageCalls = [...this.stageCalls, [...paths]];
    this.staged = [...paths];
  }

  async commit(message: string): Promise<string> {
    this.commits.push(message);
    if (this.failCommit) throw new Error('simulated commit interruption');
    this.staged = [];
    this.worktree = [];
    return 'd'.repeat(40);
  }

  async push(branch: string): Promise<string> {
    this.pushes.push(branch);
    return 'e'.repeat(40);
  }

  async createDraftPr(
    input: Readonly<{
      branch: string;
      base: string;
      title: string;
      bodyPath: string;
    }>,
  ): Promise<string> {
    this.draftInputs.push(input);
    return 'https://github.com/example/backend/pull/42';
  }
}

async function handoffFixture(
  action: PublicationAction,
  options: Readonly<{
    clean?: boolean;
    episodeFingerprint?: string;
    now?: () => string;
  }> = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'backendkit-handoff-'));
  const state = taskState(action);
  const states = new MemoryStateStore(state);
  const approvals = new MemoryApprovalStore();
  const adapter = new FakeAdapter(options.clean ?? false);
  const preflight = preflightResult(action);
  const episode = taskEpisode(preflight, options.episodeFingerprint);
  const workspace: TaskWorkspaceResult = {
    taskId: state.taskId,
    status: state.status,
    path: join(root, 'candidate'),
    branch: 'backendkit/handoff-task',
    baseRevision: state.baseRevision,
  };
  const service = new HandoffService(root, {
    states,
    approvals,
    locks: new FakeLockStore(),
    workspaces: { status: async () => workspace },
    episodes: { read: async () => episode },
    preflights: () => ({ handoffPreflight: async () => preflight }),
    adapters: () => adapter,
    now: options.now,
  });
  return { root, state, states, approvals, adapter, service };
}

function taskState(action: PublicationAction): TaskState {
  return {
    schemaVersion: 2,
    authoritySchemaVersion: 2,
    taskId: 'handoff-task',
    status: 'ready_for_review',
    startedAt: '2026-08-10T00:00:00.000Z',
    baseRevision: 'a'.repeat(40),
    planPath: 'docs/exec-plans/active/handoff.md',
    planSourceHash: 'b'.repeat(64),
    authorityHash: 'c'.repeat(64),
    declaredRisk: 'high',
    boundaries: {
      allowedPaths: ['candidate.ts'],
      allowedActions: ['edit', 'verify', action],
      maximumRisk: 'high',
      repairLimit: 2,
      timeoutMs: 3_600_000,
    },
    preexistingChanges: [],
    attempt: 1,
    transitions: [
      {
        status: 'ready_for_review',
        occurredAt: '2026-08-10T00:01:00.000Z',
        reason: 'task.verify.passed',
      },
    ],
    failures: [],
  };
}

function preflightResult(action: PublicationAction): TaskPreflightResult {
  const classification: RiskClassification = {
    declaredRisk: 'high',
    pathRisk: 'low',
    effectiveRisk: 'high',
    reasons: [],
    paths: ['candidate.ts'],
  };
  return {
    taskId: 'handoff-task',
    action,
    taskPaths: ['candidate.ts'],
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
    taskFingerprint: 'f'.repeat(64),
    planPath: 'docs/exec-plans/active/handoff.md',
    authorityHash: 'c'.repeat(64),
  };
}

function taskEpisode(
  preflight: TaskPreflightResult,
  fingerprint = preflight.taskFingerprint,
): TaskEpisode {
  return {
    schemaVersion: 1,
    taskId: preflight.taskId,
    attempt: 1,
    generatedAt: '2026-08-10T00:01:00.000Z',
    planPath: preflight.planPath,
    authorityHash: preflight.authorityHash,
    baseRevision: 'a'.repeat(40),
    taskFingerprint: fingerprint,
    effectiveRisk: 'high',
    reviewRequired: true,
    matchedRiskRuleIds: [],
    changedPaths: preflight.taskPaths,
    runtimeReasons: [],
    lanes: [{ id: 'full', status: 'passed', durationMs: 1 }],
    transitions: [
      {
        status: 'ready_for_review',
        occurredAt: '2026-08-10T00:01:00.000Z',
        reason: 'task.verify.passed',
      },
    ],
    finalStatus: 'ready_for_review',
    stopReason: 'verification.passed',
  };
}
