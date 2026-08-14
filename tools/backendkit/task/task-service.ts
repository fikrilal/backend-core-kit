import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { classifyRisk, type RiskClassification } from '../policy/risk-classifier';
import type { RepositoryChange } from './git-repository';
import { mergeChanges, SystemGitRepository, type GitRepository } from './git-repository';
import {
  assertActionAllowed,
  assertAllowedPathsStayInRepository,
  findScopeViolations,
  isRiskAbove,
  normalizeRepositoryPath,
  parseTaskPlan,
  type TaskAction,
  type TaskImpactAreas,
  type TaskPlan,
} from './task-plan';
import {
  FileTaskStateStore,
  type PreexistingChange,
  type TaskState,
  type TaskStateStore,
} from './task-state';

export type TaskBeginResult = Readonly<{
  taskId: string;
  planPath: string;
  baseRevision: string;
  declaredRisk: TaskPlan['risk'];
  preexistingPathCount: number;
}>;

export type TaskPreflightResult = Readonly<{
  taskId: string;
  action: TaskAction;
  taskPaths: ReadonlyArray<string>;
  preexistingPaths: ReadonlyArray<string>;
  controllerArtifactPaths: ReadonlyArray<string>;
  classification: RiskClassification;
  impacts: TaskImpactAreas;
  taskFingerprint: string;
  planPath: string;
  authorityHash: string;
}>;

export class TaskPreflightError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TaskPreflightError';
  }
}

export class TaskService {
  private readonly repository: GitRepository;
  private readonly states: TaskStateStore;

  constructor(
    private readonly root: string,
    repository?: GitRepository,
    states?: TaskStateStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.repository = repository ?? new SystemGitRepository(root);
    this.states = states ?? new FileTaskStateStore(root);
  }

  async begin(planPath: string): Promise<TaskBeginResult> {
    const plan = await this.loadPlan(planPath);
    if (plan.status !== 'active' || !plan.path.startsWith('docs/exec-plans/active/')) {
      throw new TaskPreflightError(
        'plan-not-active',
        'Task begin requires an active-folder V2 plan.',
      );
    }
    await assertAllowedPathsStayInRepository(this.root, plan.boundaries.allowedPaths);

    const baseRevision = await this.repository.head();
    const changes = await this.repository.worktreeChanges();
    const preexistingChanges = await this.capturePreexisting(changes);
    const state: TaskState = {
      schemaVersion: 2,
      authoritySchemaVersion: 2,
      taskId: plan.taskId,
      status: 'authorized',
      startedAt: this.now(),
      baseRevision,
      planPath: plan.path,
      planSourceHash: plan.sourceHash,
      authorityHash: plan.authorityHash,
      declaredRisk: plan.risk,
      boundaries: plan.boundaries,
      preexistingChanges,
      attempt: 0,
      transitions: [{ status: 'authorized', occurredAt: this.now(), reason: 'task.begin' }],
      failures: [],
    };
    await this.states.create(state);
    return {
      taskId: plan.taskId,
      planPath: plan.path,
      baseRevision,
      declaredRisk: plan.risk,
      preexistingPathCount: preexistingChanges.length,
    };
  }

  async preflight(taskId: string, action: TaskAction): Promise<TaskPreflightResult> {
    return await this.preflightForStatuses(taskId, action, ['authorized', 'repairing']);
  }

  async handoffPreflight(taskId: string, action: TaskAction): Promise<TaskPreflightResult> {
    return await this.preflightForStatuses(taskId, action, ['ready_for_review']);
  }

  private async preflightForStatuses(
    taskId: string,
    action: TaskAction,
    allowedStatuses: ReadonlyArray<TaskState['status']>,
  ): Promise<TaskPreflightResult> {
    const state = await this.states.read(taskId);
    if (
      !allowedStatuses.includes(state.status) ||
      !state.planPath.startsWith('docs/exec-plans/active/')
    ) {
      throw new TaskPreflightError(
        'state-not-authorized',
        `Task preflight requires state ${allowedStatuses.join(' or ')} with an active plan.`,
      );
    }
    const plan = await this.loadPlan(state.planPath);
    const expectedAuthorityHash =
      state.authoritySchemaVersion === 1 ? plan.legacyAuthorityHash : plan.authorityHash;
    if (
      plan.status !== 'active' ||
      plan.taskId !== state.taskId ||
      expectedAuthorityHash !== state.authorityHash
    ) {
      throw new TaskPreflightError(
        'authority-changed',
        'Authority-bearing plan metadata changed after task begin.',
      );
    }
    assertActionAllowed(plan.boundaries, action);

    const changes = mergeChanges(
      await this.repository.changesSince(state.baseRevision),
      await this.repository.worktreeChanges(),
    );
    const ownership = await this.evaluateOwnership(state, changes);
    const violations = findScopeViolations(ownership.taskPaths, plan.boundaries.allowedPaths);
    if (violations.length > 0) {
      throw new TaskPreflightError(
        'scope-violation',
        `Task-owned paths exceed plan scope: ${violations.join(', ')}.`,
      );
    }
    const classification = classifyRisk(ownership.taskPaths, plan.risk);
    if (isRiskAbove(classification.effectiveRisk, plan.boundaries.maximumRisk)) {
      throw new TaskPreflightError(
        'risk-above-authority',
        `Effective ${classification.effectiveRisk} risk exceeds maximum ${plan.boundaries.maximumRisk}.`,
      );
    }
    const taskFingerprint = await this.taskFingerprint(
      plan.authorityHash,
      ownership.taskPaths,
      classification.effectiveRisk,
    );

    return {
      taskId,
      action,
      taskPaths: ownership.taskPaths,
      preexistingPaths: ownership.preexistingPaths,
      controllerArtifactPaths: ownership.controllerArtifactPaths,
      classification,
      impacts: plan.impacts,
      taskFingerprint,
      planPath: plan.path,
      authorityHash: plan.authorityHash,
    };
  }

  private async taskFingerprint(
    authorityHash: string,
    paths: ReadonlyArray<string>,
    effectiveRisk: TaskPlan['risk'],
  ): Promise<string> {
    const content = await Promise.all(
      paths.map(async (path) => [path, await this.repository.contentFingerprint(path)]),
    );
    return createHash('sha256')
      .update(JSON.stringify({ authorityHash, effectiveRisk, content }))
      .digest('hex');
  }

  async classifyCurrent(planPath?: string): Promise<RiskClassification> {
    const changes = await this.repository.worktreeChanges();
    const plan = planPath ? await this.loadPlan(planPath) : undefined;
    return classifyRisk(
      changes.map(({ path }) => path),
      plan?.risk,
    );
  }

  private async loadPlan(planPath: string): Promise<TaskPlan> {
    const normalized = normalizeRepositoryPath(planPath);
    const source = await readFile(resolve(this.root, normalized), 'utf8');
    return parseTaskPlan(normalized, source);
  }

  private async capturePreexisting(
    changes: ReadonlyArray<RepositoryChange>,
  ): Promise<ReadonlyArray<PreexistingChange>> {
    return await Promise.all(
      changes.map(async (change) => ({
        path: change.path,
        sources: change.sources,
        contentFingerprint: await this.repository.contentFingerprint(change.path),
      })),
    );
  }

  private async evaluateOwnership(
    state: TaskState,
    changes: ReadonlyArray<RepositoryChange>,
  ): Promise<
    Readonly<{
      taskPaths: ReadonlyArray<string>;
      preexistingPaths: ReadonlyArray<string>;
      controllerArtifactPaths: ReadonlyArray<string>;
    }>
  > {
    const preexisting = new Map(state.preexistingChanges.map((change) => [change.path, change]));
    const taskPaths: string[] = [];
    const preexistingPaths: string[] = [];
    const controllerArtifactPaths: string[] = [];
    for (const change of changes) {
      if (isUntrackedControllerArtifact(change)) {
        controllerArtifactPaths.push(change.path);
        continue;
      }
      const original = preexisting.get(change.path);
      if (!original) {
        taskPaths.push(change.path);
        continue;
      }
      const currentFingerprint = await this.repository.contentFingerprint(change.path);
      if (currentFingerprint === original.contentFingerprint) preexistingPaths.push(change.path);
      else taskPaths.push(change.path);
    }
    return {
      taskPaths: [...new Set(taskPaths)].sort(),
      preexistingPaths: preexistingPaths.sort(),
      controllerArtifactPaths: controllerArtifactPaths.sort(),
    };
  }
}

const controllerArtifactPaths = new Set([
  '_WIP/architecture-smells.md',
  '_WIP/duplication-report.md',
  '_WIP/small-helper-duplication-report.md',
]);

function isUntrackedControllerArtifact(change: RepositoryChange): boolean {
  return change.sources.includes('untracked') && controllerArtifactPaths.has(change.path);
}
