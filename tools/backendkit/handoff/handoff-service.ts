import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

import { EpisodeStore, type TaskEpisode } from '../evidence/episode';
import { writePrivateArtifact } from '../evidence/private-artifact';
import { SystemGitRepository } from '../task/git-repository';
import { TaskService, type TaskPreflightResult } from '../task/task-service';
import {
  FileTaskStateStore,
  transitionTask,
  type TaskState,
  type TaskStateStore,
} from '../task/task-state';
import { FileRepositoryLockStore, type RepositoryLockStore } from '../workspace/repository-lock';
import { TaskWorkspaceService, type TaskWorkspaceResult } from '../workspace/task-workspace';
import {
  FileHandoffApprovalStore,
  type HandoffApproval,
  type HandoffApprovalStore,
  type PublicationAction,
} from './handoff-approval';
import {
  SystemPublicationAdapter,
  type PublicationAdapter,
  type PublicationRepositoryState,
} from './publication-adapter';

const approvalLifetimeMs = 15 * 60_000;

export type HandoffDryRunResult = Readonly<{
  taskId: string;
  action: PublicationAction;
  attempt: number;
  branch: string;
  remote: string;
  changedPaths: ReadonlyArray<string>;
  expiresAt: string;
  approval: string;
}>;

export type HandoffMutationResult = Readonly<{
  taskId: string;
  action: PublicationAction;
  outcome: string;
}>;

interface EpisodeReader {
  read(taskId: string, attempt: number): Promise<TaskEpisode>;
}

interface WorkspaceInspector {
  status(taskId: string): Promise<TaskWorkspaceResult>;
}

interface ReviewPreflightService {
  handoffPreflight(taskId: string, action: PublicationAction): Promise<TaskPreflightResult>;
}

type ReviewPreflightFactory = (root: string) => ReviewPreflightService;
type PublicationAdapterFactory = (root: string) => PublicationAdapter;

type FreshHandoff = Readonly<{
  state: TaskState;
  episode: TaskEpisode;
  preflight: TaskPreflightResult;
  workspace: TaskWorkspaceResult;
  repository: PublicationRepositoryState;
  adapter: PublicationAdapter;
}>;

export class HandoffError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HandoffError';
  }
}

export class HandoffService {
  private readonly states: TaskStateStore;
  private readonly episodes: EpisodeReader;
  private readonly workspaces: WorkspaceInspector;
  private readonly approvals: HandoffApprovalStore;
  private readonly locks: RepositoryLockStore;
  private readonly preflights: ReviewPreflightFactory;
  private readonly adapters: PublicationAdapterFactory;

  constructor(
    private readonly root: string,
    options: Readonly<{
      states?: TaskStateStore;
      episodes?: EpisodeReader;
      workspaces?: WorkspaceInspector;
      approvals?: HandoffApprovalStore;
      locks?: RepositoryLockStore;
      preflights?: ReviewPreflightFactory;
      adapters?: PublicationAdapterFactory;
      now?: () => string;
    }> = {},
  ) {
    this.states = options.states ?? new FileTaskStateStore(root);
    this.episodes = options.episodes ?? new EpisodeStore(root);
    this.workspaces = options.workspaces ?? new TaskWorkspaceService(root, { states: this.states });
    this.approvals = options.approvals ?? new FileHandoffApprovalStore(root);
    this.locks = options.locks ?? new FileRepositoryLockStore(root);
    this.preflights =
      options.preflights ??
      ((candidateRoot) =>
        new TaskService(candidateRoot, new SystemGitRepository(candidateRoot), this.states));
    this.adapters =
      options.adapters ?? ((candidateRoot) => new SystemPublicationAdapter(candidateRoot));
    this.now = options.now ?? (() => new Date().toISOString());
  }

  private readonly now: () => string;

  async dryRun(taskId: string, action: PublicationAction): Promise<HandoffDryRunResult> {
    const lease = await this.locks.acquire(taskId, true);
    try {
      const existing = await this.approvals.read(taskId, action);
      if (existing && existing.status !== 'prepared') {
        throw new HandoffError(
          'handoff-action-already-started',
          `Handoff action '${action}' already reached '${existing.status}'.`,
        );
      }
      const fresh = await this.fresh(taskId, action);
      this.assertRepositoryShape(action, fresh);
      const approval = randomBytes(32).toString('hex');
      const preparedAt = this.now();
      const expiresAt = new Date(Date.parse(preparedAt) + approvalLifetimeMs).toISOString();
      const record: HandoffApproval = {
        schemaVersion: 1,
        taskId,
        action,
        status: 'prepared',
        taskFingerprint: fresh.preflight.taskFingerprint,
        authorityHash: fresh.preflight.authorityHash,
        attempt: fresh.state.attempt,
        branch: fresh.repository.branch,
        remote: fresh.repository.remote,
        changedPaths: fresh.preflight.taskPaths,
        challengeHash: hash(approval),
        preparedAt,
        expiresAt,
      };
      await this.approvals.write(record);
      return {
        taskId,
        action,
        attempt: record.attempt,
        branch: record.branch,
        remote: record.remote,
        changedPaths: record.changedPaths,
        expiresAt,
        approval,
      };
    } finally {
      await lease.release();
    }
  }

  async commit(taskId: string, approval: string, message: string): Promise<HandoffMutationResult> {
    return await this.execute(taskId, 'commit', approval, async (fresh) => {
      await fresh.adapter.stage(fresh.preflight.taskPaths);
      const staged = await fresh.adapter.inspect();
      assertSamePaths(staged.stagedPaths, fresh.preflight.taskPaths, 'staged');
      const revision = await fresh.adapter.commit(message);
      const completed = await fresh.adapter.inspect();
      assertClean(completed);
      return revision;
    });
  }

  async push(taskId: string, approval: string): Promise<HandoffMutationResult> {
    return await this.execute(taskId, 'push', approval, async (fresh) => {
      assertClean(fresh.repository);
      return await fresh.adapter.push(fresh.repository.branch);
    });
  }

  async draftPr(
    taskId: string,
    approval: string,
    base: string,
    title: string,
  ): Promise<HandoffMutationResult> {
    return await this.execute(
      taskId,
      'draft-pr',
      approval,
      async (fresh) => {
        assertClean(fresh.repository);
        const bodyPath = resolve(
          this.root,
          '.tmp',
          'backendkit',
          'tasks',
          taskId,
          'handoff',
          'draft-pr-body.md',
        );
        await writePrivateArtifact(bodyPath, handoffBody(fresh));
        return await fresh.adapter.createDraftPr({
          branch: fresh.repository.branch,
          base,
          title,
          bodyPath,
        });
      },
      true,
    );
  }

  private async execute(
    taskId: string,
    action: PublicationAction,
    challenge: string,
    mutation: (fresh: FreshHandoff) => Promise<string>,
    markHandedOff = false,
  ): Promise<HandoffMutationResult> {
    const lease = await this.locks.acquire(taskId, true);
    try {
      const approval = await this.approvals.read(taskId, action);
      this.assertApproval(approval, challenge, action);
      const fresh = await this.fresh(taskId, action);
      this.assertRepositoryShape(action, fresh);
      assertApprovalMatches(approval, fresh);
      await this.approvals.write({ ...approval, status: 'executing' });
      let outcome: string;
      try {
        outcome = await mutation(fresh);
      } catch {
        await this.approvals.write({
          ...approval,
          status: 'uncertain',
          completedAt: this.now(),
          outcome: 'external-outcome-uncertain',
        });
        throw new HandoffError(
          'handoff-outcome-uncertain',
          `Handoff '${action}' did not complete cleanly; inspect local and remote state before any retry.`,
        );
      }
      await this.approvals.write({
        ...approval,
        status: 'completed',
        completedAt: this.now(),
        outcome,
      });
      if (markHandedOff) {
        const state = await this.states.read(taskId);
        if (state.status !== 'ready_for_review') {
          throw new HandoffError(
            'handoff-state-changed',
            'Task state changed after draft PR creation; reconcile manually.',
          );
        }
        await this.states.write(
          transitionTask(state, 'handed_off', this.now(), 'handoff.draft-pr'),
        );
      }
      return { taskId, action, outcome };
    } finally {
      await lease.release();
    }
  }

  private async fresh(taskId: string, action: PublicationAction): Promise<FreshHandoff> {
    const state = await this.states.read(taskId);
    if (state.status !== 'ready_for_review' || state.attempt <= 0) {
      throw new HandoffError(
        'handoff-state-not-ready',
        'Handoff requires a verified task in ready_for_review.',
      );
    }
    const workspace = await this.workspaces.status(taskId);
    const preflight = await this.preflights(workspace.path).handoffPreflight(taskId, action);
    const episode = await this.episodes.read(taskId, state.attempt);
    assertFreshEpisode(state, preflight, episode);
    const adapter = this.adapters(workspace.path);
    const repository = await adapter.inspect();
    if (repository.branch !== workspace.branch) {
      throw new HandoffError(
        'handoff-branch-mismatch',
        'Workspace branch changed after verification.',
      );
    }
    return { state, episode, preflight, workspace, repository, adapter };
  }

  private assertRepositoryShape(action: PublicationAction, fresh: FreshHandoff): void {
    if (fresh.repository.stagedPaths.length > 0) {
      throw new HandoffError(
        'handoff-prestaged-paths',
        'Handoff refuses paths staged outside the publication adapter.',
      );
    }
    if (action === 'commit') {
      assertSamePaths(fresh.repository.worktreePaths, fresh.preflight.taskPaths, 'worktree');
    } else {
      assertClean(fresh.repository);
    }
  }

  private assertApproval(
    approval: HandoffApproval | undefined,
    challenge: string,
    action: PublicationAction,
  ): asserts approval is HandoffApproval {
    if (!approval || approval.action !== action || approval.status !== 'prepared') {
      throw new HandoffError(
        'handoff-approval-missing',
        `Prepare a fresh '${action}' dry-run before publication.`,
      );
    }
    if (Date.parse(this.now()) > Date.parse(approval.expiresAt)) {
      throw new HandoffError('handoff-approval-expired', 'Handoff approval expired.');
    }
    if (!/^[0-9a-f]{64}$/.test(challenge) || hash(challenge) !== approval.challengeHash) {
      throw new HandoffError('handoff-approval-invalid', 'Handoff approval does not match.');
    }
  }
}

function assertFreshEpisode(
  state: TaskState,
  preflight: TaskPreflightResult,
  episode: TaskEpisode,
): void {
  if (
    episode.taskId !== state.taskId ||
    episode.attempt !== state.attempt ||
    episode.planPath !== state.planPath ||
    episode.authorityHash !== preflight.authorityHash ||
    episode.baseRevision !== state.baseRevision ||
    episode.taskFingerprint !== preflight.taskFingerprint ||
    episode.finalStatus !== 'ready_for_review' ||
    episode.stopReason !== 'verification.passed' ||
    episode.lanes.length === 0 ||
    episode.lanes.some(({ status }) => status !== 'passed')
  ) {
    throw new HandoffError(
      'handoff-verification-stale',
      'Latest successful verification does not match current task content.',
    );
  }
  assertSamePaths(episode.changedPaths, preflight.taskPaths, 'verified');
}

function assertApprovalMatches(approval: HandoffApproval, fresh: FreshHandoff): void {
  if (
    approval.taskId !== fresh.state.taskId ||
    approval.attempt !== fresh.state.attempt ||
    approval.taskFingerprint !== fresh.preflight.taskFingerprint ||
    approval.authorityHash !== fresh.preflight.authorityHash ||
    approval.branch !== fresh.repository.branch ||
    approval.remote !== fresh.repository.remote
  ) {
    throw new HandoffError(
      'handoff-approval-stale',
      'Repository or verification state changed after dry-run approval.',
    );
  }
  assertSamePaths(approval.changedPaths, fresh.preflight.taskPaths, 'approved');
}

function assertSamePaths(
  actual: ReadonlyArray<string>,
  expected: ReadonlyArray<string>,
  label: string,
): void {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (left.length !== right.length || left.some((path, index) => path !== right[index])) {
    throw new HandoffError(
      'handoff-paths-mismatch',
      `${label} paths do not exactly match verified task ownership.`,
    );
  }
}

function assertClean(state: PublicationRepositoryState): void {
  if (state.stagedPaths.length > 0 || state.worktreePaths.length > 0) {
    throw new HandoffError('handoff-worktree-dirty', 'Publication requires a clean task worktree.');
  }
}

function handoffBody(fresh: FreshHandoff): string {
  return [
    '## Verified handoff',
    '',
    `- Task: \`${fresh.state.taskId}\``,
    `- Verification attempt: ${fresh.state.attempt}`,
    `- Effective risk: \`${fresh.episode.effectiveRisk}\``,
    `- Branch: \`${fresh.repository.branch}\``,
    `- Verification lanes: ${fresh.episode.lanes.map(({ id }) => `\`${id}\``).join(', ')}`,
    '',
    '### Verified paths',
    '',
    ...fresh.preflight.taskPaths.map((path) => `- \`${path.replace(/`/g, '')}\``),
    '',
    'Generated from sanitized repository evidence. No raw diagnostics or model output included.',
    '',
  ].join('\n');
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
