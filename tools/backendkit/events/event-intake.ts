import { createHash, randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { link, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import { FileRepositoryLockStore, type RepositoryLockStore } from '../workspace/repository-lock';
import {
  assertAllowedPathsStayInRepository,
  parseTaskPlan,
  type TaskPlan,
} from '../task/task-plan';
import { TaskService, type TaskBeginResult } from '../task/task-service';
import {
  FileTaskStateStore,
  TaskStateError,
  type TaskLifecycleStatus,
  type TaskStateStore,
} from '../task/task-state';
import {
  EventReceiptError,
  FileEventReceiptStore,
  type EventReceipt,
  type EventReceiptStore,
} from './event-receipt';

const maxPlanBytes = 64 * 1024;
const activeTaskStatuses: ReadonlySet<TaskLifecycleStatus> = new Set([
  'queued',
  'authorized',
  'preparing',
  'running',
  'verifying',
  'repairing',
  'ready_for_review',
]);

export type EventIntakeResult =
  | Readonly<{
      kind: 'accepted';
      recovered: boolean;
      eventId: string;
      task: TaskBeginResult;
      activePlanPath: string;
    }>
  | Readonly<{ kind: 'idle'; reason: 'no-queued-plans' | 'all-events-accepted' }>;

export interface TaskStateCatalog {
  activeTaskIds(): Promise<ReadonlyArray<string>>;
}

type QueuedPlanCandidate = Readonly<{ plan: TaskPlan; source: string }>;

export class EventIntakeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EventIntakeError';
  }
}

export class FileTaskStateCatalog implements TaskStateCatalog {
  private readonly states: TaskStateStore;

  constructor(
    private readonly root: string,
    states?: TaskStateStore,
  ) {
    this.states = states ?? new FileTaskStateStore(root);
  }

  async activeTaskIds(): Promise<ReadonlyArray<string>> {
    const directory = resolve(this.root, '.tmp', 'backendkit', 'tasks');
    let entries: ReadonlyArray<Dirent>;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error: unknown) {
      if (isCode(error, 'ENOENT')) return [];
      throw error;
    }
    const active: string[] = [];
    for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(entry.name)) continue;
      const state = await this.states.read(entry.name);
      if (activeTaskStatuses.has(state.status)) active.push(state.taskId);
    }
    return active;
  }
}

export class EventIntakeService {
  private readonly receipts: EventReceiptStore;
  private readonly locks: RepositoryLockStore;
  private readonly states: TaskStateStore;
  private readonly tasks: TaskService;
  private readonly catalog: TaskStateCatalog;

  constructor(
    private readonly root: string,
    options: Readonly<{
      receipts?: EventReceiptStore;
      locks?: RepositoryLockStore;
      states?: TaskStateStore;
      tasks?: TaskService;
      catalog?: TaskStateCatalog;
      now?: () => string;
    }> = {},
  ) {
    this.receipts = options.receipts ?? new FileEventReceiptStore(root);
    this.locks = options.locks ?? new FileRepositoryLockStore(root);
    this.states = options.states ?? new FileTaskStateStore(root);
    this.tasks = options.tasks ?? new TaskService(root, undefined, this.states);
    this.catalog = options.catalog ?? new FileTaskStateCatalog(root, this.states);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  private readonly now: () => string;

  async runOnce(): Promise<EventIntakeResult> {
    const lease = await this.locks.acquire('events-intake', true);
    try {
      const claimed = (await this.receipts.list()).filter(({ status }) => status === 'claimed');
      if (claimed.length > 1) {
        throw new EventIntakeError(
          'event-recovery-ambiguous',
          'More than one claimed event exists; refusing ambiguous recovery.',
        );
      }
      if (claimed[0]) {
        await this.assertRecoveryFlight(claimed[0]);
        return await this.accept(claimed[0], true);
      }

      await this.assertSingleFlight();
      const plans = await this.queuedPlans();
      if (plans.length === 0) return { kind: 'idle', reason: 'no-queued-plans' };
      for (const candidate of plans) {
        const receipt = receiptFor(candidate, this.now());
        try {
          const existing = await this.receipts.read(receipt.eventId);
          if (existing.status === 'accepted') continue;
          return await this.accept(existing, true);
        } catch (error: unknown) {
          if (!(error instanceof EventReceiptError) || error.code !== 'event-receipt-missing') {
            throw error;
          }
        }
        await this.receipts.create(receipt);
        return await this.accept(receipt, false);
      }
      return { kind: 'idle', reason: 'all-events-accepted' };
    } finally {
      await lease.release();
    }
  }

  private async accept(receipt: EventReceipt, recovered: boolean): Promise<EventIntakeResult> {
    if (receipt.status === 'accepted') {
      throw new EventIntakeError('event-already-accepted', 'Event was already accepted.');
    }
    const activeSource = await this.activatePlan(receipt);
    const activePlan = parseTaskPlan(receipt.activePlanPath, activeSource);
    assertReceiptMatchesPlan(receipt, activePlan, activeSource);
    let task: TaskBeginResult;
    try {
      task = await this.tasks.begin(receipt.activePlanPath);
    } catch (error: unknown) {
      if (!(error instanceof TaskStateError) || error.code !== 'state-exists') throw error;
      const state = await this.states.read(receipt.taskId);
      if (
        state.taskId !== receipt.taskId ||
        state.planPath !== receipt.activePlanPath ||
        state.planSourceHash !== receipt.activeSourceHash ||
        state.authorityHash !== receipt.authorityHash ||
        state.status !== 'authorized'
      ) {
        throw new EventIntakeError(
          'event-task-conflict',
          'Existing task state does not match the claimed event.',
        );
      }
      task = {
        taskId: state.taskId,
        planPath: state.planPath,
        baseRevision: state.baseRevision,
        declaredRisk: state.declaredRisk,
        preexistingPathCount: state.preexistingChanges.length,
      };
    }
    await this.receipts.write({
      ...receipt,
      status: 'accepted',
      completedAt: this.now(),
    });
    return {
      kind: 'accepted',
      recovered,
      eventId: receipt.eventId,
      task,
      activePlanPath: receipt.activePlanPath,
    };
  }

  private async activatePlan(receipt: EventReceipt): Promise<string> {
    const queued = await optionalBoundedRead(resolve(this.root, receipt.queuedPlanPath));
    const active = await optionalBoundedRead(resolve(this.root, receipt.activePlanPath));
    if (!queued && !active) {
      throw new EventIntakeError(
        'event-plan-missing',
        'Claimed plan is missing from the queue and active folder.',
      );
    }
    let expectedActive: string;
    if (queued) {
      const plan = parseTaskPlan(receipt.queuedPlanPath, queued);
      assertReceiptMatchesPlan(receipt, plan, promoteSource(queued));
      await assertAllowedPathsStayInRepository(this.root, plan.boundaries.allowedPaths);
      expectedActive = promoteSource(queued);
    } else {
      expectedActive = active ?? '';
    }
    assertHash(expectedActive, receipt.activeSourceHash, 'active plan');
    if (active) {
      if (active !== expectedActive) {
        throw new EventIntakeError(
          'event-active-plan-conflict',
          `Active destination conflicts with event '${receipt.eventId}'.`,
        );
      }
    } else {
      await atomicCreate(resolve(this.root, receipt.activePlanPath), expectedActive);
    }
    if (queued) await unlink(resolve(this.root, receipt.queuedPlanPath));
    return expectedActive;
  }

  private async assertSingleFlight(): Promise<void> {
    const activeTaskIds = await this.catalog.activeTaskIds();
    if (activeTaskIds.length > 0) {
      throw new EventIntakeError(
        'event-task-active',
        `Event intake requires no active task; found ${activeTaskIds.join(', ')}.`,
      );
    }
    const activePlans = await markdownFiles(resolve(this.root, 'docs', 'exec-plans', 'active'));
    if (activePlans.length > 0) {
      throw new EventIntakeError(
        'event-plan-active',
        `Event intake requires no active execution plan; found ${activePlans.join(', ')}.`,
      );
    }
  }

  private async assertRecoveryFlight(receipt: EventReceipt): Promise<void> {
    const activeTaskIds = await this.catalog.activeTaskIds();
    if (activeTaskIds.some((taskId) => taskId !== receipt.taskId)) {
      throw new EventIntakeError(
        'event-recovery-task-conflict',
        'An unrelated task became active while the event was claimed.',
      );
    }
    const activePlans = await markdownFiles(resolve(this.root, 'docs', 'exec-plans', 'active'));
    const expectedPlan = basename(receipt.activePlanPath);
    if (activePlans.some((plan) => plan !== expectedPlan)) {
      throw new EventIntakeError(
        'event-recovery-plan-conflict',
        'An unrelated execution plan became active while the event was claimed.',
      );
    }
  }

  private async queuedPlans(): Promise<ReadonlyArray<QueuedPlanCandidate>> {
    const directory = resolve(this.root, 'docs', 'exec-plans', 'queued');
    const files = await markdownFiles(directory);
    return await Promise.all(
      files.map(async (file) => {
        const path = `docs/exec-plans/queued/${file}`;
        const source = await readBounded(resolve(this.root, path));
        const plan = parseTaskPlan(path, source);
        await assertAllowedPathsStayInRepository(this.root, plan.boundaries.allowedPaths);
        return { plan, source };
      }),
    );
  }
}

function receiptFor(candidate: QueuedPlanCandidate, receivedAt: string): EventReceipt {
  const { plan, source } = candidate;
  if (plan.status !== 'queued' || !plan.path.startsWith('docs/exec-plans/queued/')) {
    throw new EventIntakeError('event-plan-not-queued', 'Event intake requires a queued plan.');
  }
  const activePlanPath = `docs/exec-plans/active/${basename(plan.path)}`;
  const activeSource = promoteSource(source);
  const sourceHashMaterial = `${plan.taskId}\n${plan.sourceHash}`;
  return {
    schemaVersion: 1,
    eventId: createHash('sha256').update(`queued-plan\n${sourceHashMaterial}`).digest('hex'),
    source: 'queued-plan',
    status: 'claimed',
    taskId: plan.taskId,
    queuedPlanPath: plan.path,
    activePlanPath,
    queuedSourceHash: plan.sourceHash,
    activeSourceHash: createHash('sha256').update(activeSource).digest('hex'),
    authorityHash: plan.authorityHash,
    receivedAt,
  };
}

function assertReceiptMatchesPlan(
  receipt: EventReceipt,
  plan: TaskPlan,
  activeSource: string,
): void {
  const expectedActiveHash = createHash('sha256').update(activeSource).digest('hex');
  if (
    plan.taskId !== receipt.taskId ||
    plan.authorityHash !== receipt.authorityHash ||
    (plan.status === 'queued' && plan.sourceHash !== receipt.queuedSourceHash) ||
    expectedActiveHash !== receipt.activeSourceHash
  ) {
    throw new EventIntakeError(
      'event-plan-mismatch',
      `Plan no longer matches event '${receipt.eventId}'.`,
    );
  }
}

function promoteSource(source: string): string {
  const matches = [...source.matchAll(/^\*\*Status:\*\*\s*queued\s*$/gim)];
  if (matches.length !== 1) {
    throw new EventIntakeError('event-status-invalid', 'Queued plan status is ambiguous.');
  }
  return source.replace(/^\*\*Status:\*\*\s*queued\s*$/im, '**Status:** active');
}

async function markdownFiles(directory: string): Promise<ReadonlyArray<string>> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map(({ name }) => name)
      .sort();
  } catch (error: unknown) {
    if (isCode(error, 'ENOENT')) return [];
    throw error;
  }
}

async function optionalBoundedRead(path: string): Promise<string | undefined> {
  try {
    return await readBounded(path);
  } catch (error: unknown) {
    if (isCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}

async function readBounded(path: string): Promise<string> {
  const content = await readFile(path);
  if (content.byteLength > maxPlanBytes) {
    throw new EventIntakeError('event-plan-too-large', `Plan exceeds ${maxPlanBytes} bytes.`);
  }
  return content.toString('utf8');
}

async function atomicCreate(path: string, source: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, source, { encoding: 'utf8', flag: 'wx' });
  try {
    await link(temporary, path);
  } finally {
    await unlink(temporary);
  }
}

function assertHash(source: string, expected: string, label: string): void {
  if (createHash('sha256').update(source).digest('hex') !== expected) {
    throw new EventIntakeError('event-plan-mismatch', `${label} hash does not match the event.`);
  }
}

function isCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
