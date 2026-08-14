import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runProcess } from '../process-runner';
import { parseTaskPlan } from '../task/task-plan';
import { TaskService, type TaskBeginResult } from '../task/task-service';
import { FileTaskStateStore, transitionTask } from '../task/task-state';
import { EventIntakeService } from './event-intake';
import { FileEventReceiptStore, validateEventReceipt, type EventReceipt } from './event-receipt';

describe('EventIntakeService', () => {
  it('activates one authorized queued plan without changing its authority', async () => {
    const fixture = await repositoryFixture();
    const queuedSource = planSource('queued');
    const queuedPlan = parseTaskPlan(fixture.queuedPath, queuedSource);
    await writeFile(join(fixture.root, fixture.queuedPath), queuedSource);
    await commitAll(fixture.root);

    const result = await new EventIntakeService(fixture.root).runOnce();

    expect(result.kind).toBe('accepted');
    if (result.kind !== 'accepted') throw new Error('Expected an accepted event.');
    const activeSource = await readFile(join(fixture.root, result.activePlanPath), 'utf8');
    const activePlan = parseTaskPlan(result.activePlanPath, activeSource);
    expect(activePlan.status).toBe('active');
    expect(activePlan.authorityHash).toBe(queuedPlan.authorityHash);
    await expect(readFile(join(fixture.root, fixture.queuedPath), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const receiptPath = join(
      fixture.root,
      '.tmp',
      'backendkit',
      'events',
      `${result.eventId}.json`,
    );
    expect((await stat(receiptPath)).mode & 0o777).toBe(0o600);
    expect(await readFile(receiptPath, 'utf8')).not.toMatch(
      /prompt|model|token|stdout|stderr|pid/i,
    );

    const states = new FileTaskStateStore(fixture.root);
    const state = await states.read(queuedPlan.taskId);
    await states.write(
      transitionTask(state, 'cancelled', '2026-08-09T00:02:00.000Z', 'fixture.cancelled'),
    );
    await unlink(join(fixture.root, result.activePlanPath));
    await writeFile(join(fixture.root, fixture.queuedPath), queuedSource);
    await expect(new EventIntakeService(fixture.root).runOnce()).resolves.toEqual({
      kind: 'idle',
      reason: 'all-events-accepted',
    });
  });

  it('recovers a claimed event after activation without creating another task', async () => {
    const fixture = await repositoryFixture();
    await writeFile(join(fixture.root, fixture.queuedPath), planSource('queued'));
    await commitAll(fixture.root);
    const failingTasks = new FailingBeginService(fixture.root);

    await expect(
      new EventIntakeService(fixture.root, { tasks: failingTasks }).runOnce(),
    ).rejects.toThrow('simulated interruption');

    const result = await new EventIntakeService(fixture.root).runOnce();
    expect(result).toMatchObject({ kind: 'accepted', recovered: true });
    const state = await new FileTaskStateStore(fixture.root).read('queued-event-task');
    expect(state.taskId).toBe('queued-event-task');
    await expect(new EventIntakeService(fixture.root).runOnce()).rejects.toThrow(
      'requires no active task',
    );
  });

  it('refuses intake while another active plan exists', async () => {
    const fixture = await repositoryFixture();
    await writeFile(join(fixture.root, fixture.queuedPath), planSource('queued'));
    await writeFile(
      join(fixture.root, 'docs', 'exec-plans', 'active', 'existing.md'),
      planSource('active', 'existing-task'),
    );

    await expect(new EventIntakeService(fixture.root).runOnce()).rejects.toThrow(
      'requires no active execution plan',
    );
  });

  it('refuses claimed-event recovery after an unrelated plan becomes active', async () => {
    const fixture = await repositoryFixture();
    await writeFile(join(fixture.root, fixture.queuedPath), planSource('queued'));
    await commitAll(fixture.root);
    await expect(
      new EventIntakeService(fixture.root, {
        tasks: new FailingBeginService(fixture.root),
      }).runOnce(),
    ).rejects.toThrow('simulated interruption');
    await writeFile(
      join(fixture.root, 'docs', 'exec-plans', 'active', 'unrelated.md'),
      planSource('active', 'unrelated-task'),
    );

    await expect(new EventIntakeService(fixture.root).runOnce()).rejects.toThrow(
      'unrelated execution plan became active',
    );
  });

  it('returns an idle result when no queued plan exists', async () => {
    const fixture = await repositoryFixture();

    await expect(new EventIntakeService(fixture.root).runOnce()).resolves.toEqual({
      kind: 'idle',
      reason: 'no-queued-plans',
    });
  });
});

describe('FileEventReceiptStore', () => {
  it('rejects unknown process or model fields', () => {
    const receipt = receiptState();
    expect(() => validateEventReceipt({ ...receipt, pid: 123 })).toThrow('invalid');
    expect(() => validateEventReceipt({ ...receipt, model: 'codex' })).toThrow('invalid');
  });

  it('round-trips strict claimed and accepted receipts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backendkit-event-receipt-'));
    const store = new FileEventReceiptStore(root);
    const claimed = receiptState();
    await store.create(claimed);
    await expect(store.read(claimed.eventId)).resolves.toEqual(claimed);
    const accepted: EventReceipt = {
      ...claimed,
      status: 'accepted',
      completedAt: '2026-08-09T00:01:00.000Z',
    };
    await store.write(accepted);
    await expect(store.list()).resolves.toEqual([accepted]);
  });

  it('rejects oversized receipt input before JSON parsing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'backendkit-event-receipt-large-'));
    const eventId = 'd'.repeat(64);
    const directory = join(root, '.tmp', 'backendkit', 'events');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${eventId}.json`), 'x'.repeat(16 * 1024 + 1));

    await expect(new FileEventReceiptStore(root).read(eventId)).rejects.toThrow(
      'exceeds 16384 bytes',
    );
  });
});

class FailingBeginService extends TaskService {
  override async begin(_planPath: string): Promise<TaskBeginResult> {
    throw new Error('simulated interruption');
  }
}

async function repositoryFixture(): Promise<Readonly<{ root: string; queuedPath: string }>> {
  const root = await mkdtemp(join(tmpdir(), 'backendkit-event-intake-'));
  const queuedPath = 'docs/exec-plans/queued/queued-event.md';
  await mkdir(join(root, 'docs', 'exec-plans', 'queued'), { recursive: true });
  await mkdir(join(root, 'docs', 'exec-plans', 'active'), { recursive: true });
  await writeFile(join(root, '.gitignore'), '.tmp/\n');
  await git(root, ['init', '--quiet']);
  await git(root, ['config', 'user.email', 'fixture@example.test']);
  await git(root, ['config', 'user.name', 'Fixture']);
  await git(root, ['add', '.gitignore']);
  await git(root, ['commit', '--quiet', '-m', 'fixture']);
  return { root, queuedPath };
}

async function commitAll(root: string): Promise<void> {
  await git(root, ['add', '.']);
  await git(root, ['commit', '--quiet', '-m', 'queued plan']);
}

async function git(root: string, args: ReadonlyArray<string>): Promise<string> {
  const result = await runProcess({ command: 'git', args, cwd: root, stdio: 'pipe' });
  if (result.code !== 0) throw new Error(result.stderr);
  return result.stdout;
}

function planSource(status: 'active' | 'queued', taskId = 'queued-event-task'): string {
  return `# Queued event task

**Plan version:** 2
**Task ID:** ${taskId}
**Status:** ${status}
**Owner:** Fixture
**Risk:** low
**Authority:** edit and verify locally; no external mutation
**Allowed paths:** candidate.txt
**Allowed actions:** edit, verify
**Maximum risk:** low
**Repair limit:** 1
**Task timeout:** 30m

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

function receiptState(): EventReceipt {
  const queuedSource = planSource('queued');
  const activeSource = planSource('active');
  const plan = parseTaskPlan('docs/exec-plans/queued/queued-event.md', queuedSource);
  return {
    schemaVersion: 1,
    eventId: 'a'.repeat(64),
    source: 'queued-plan',
    status: 'claimed',
    taskId: plan.taskId,
    queuedPlanPath: plan.path,
    activePlanPath: 'docs/exec-plans/active/queued-event.md',
    queuedSourceHash: plan.sourceHash,
    activeSourceHash: createHash('sha256').update(activeSource).digest('hex'),
    authorityHash: plan.authorityHash,
    receivedAt: '2026-08-09T00:00:00.000Z',
  };
}
