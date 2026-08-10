import type { ProcessRequest, ProcessResult, ProcessRunner } from '../process-runner';
import type { RepositoryLockLease, RepositoryLockStore } from '../workspace/repository-lock';
import { maintenanceSteps, MaintenanceService, type MaintenanceStep } from './maintenance-service';

describe('MaintenanceService', () => {
  it('runs only the fixed observation registry in order', async () => {
    const runner = new RecordingRunner();
    const service = new MaintenanceService('/repo', runner, new FakeLockStore());

    const result = await service.runOnce();

    expect(result.steps.map(({ id }) => id)).toEqual([
      'knowledge',
      'architecture',
      'duplication',
      'dependencies',
    ]);
    expect(runner.requests.map(({ args }) => args.at(-1))).toEqual([
      'verify:knowledge',
      'smells:arch',
      'duplication:report',
      'audit:prod',
    ]);
    expect(runner.requests.every(({ cwd, stdio }) => cwd === '/repo' && stdio === 'inherit')).toBe(
      true,
    );
  });

  it('fails fast and releases the short command lock', async () => {
    const runner = new RecordingRunner(1);
    const locks = new FakeLockStore();
    const steps: ReadonlyArray<MaintenanceStep> = maintenanceSteps.slice(0, 2);
    const service = new MaintenanceService('/repo', runner, locks, steps);

    await expect(service.runOnce()).rejects.toThrow("Maintenance step 'architecture' failed");

    expect(runner.requests).toHaveLength(2);
    expect(locks.released).toBe(true);
  });
});

class RecordingRunner implements ProcessRunner {
  readonly requests: ProcessRequest[] = [];

  constructor(private readonly failAt = -1) {}

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.requests.push(request);
    const failed = this.requests.length - 1 === this.failAt;
    return {
      command: request.command,
      args: request.args,
      code: failed ? 1 : 0,
      signal: null,
      timedOut: false,
      durationMs: 1,
      stdout: '',
      stderr: '',
    };
  }
}

class FakeLockStore implements RepositoryLockStore {
  released = false;

  async acquire(): Promise<RepositoryLockLease> {
    return {
      recoveredStaleLock: false,
      release: async () => {
        this.released = true;
      },
    };
  }
}
