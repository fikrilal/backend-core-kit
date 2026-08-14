import { performance } from 'node:perf_hooks';

import { npmInvocation, systemProcessRunner, type ProcessRunner } from '../process-runner';
import { FileRepositoryLockStore, type RepositoryLockStore } from '../workspace/repository-lock';

export type MaintenanceStep = Readonly<{
  id: 'knowledge' | 'architecture' | 'duplication' | 'dependencies';
  title: string;
  script: string;
}>;

export type MaintenanceStepResult = Readonly<{
  id: MaintenanceStep['id'];
  durationMs: number;
}>;

export type MaintenanceResult = Readonly<{
  steps: ReadonlyArray<MaintenanceStepResult>;
}>;

export const maintenanceSteps: ReadonlyArray<MaintenanceStep> = [
  { id: 'knowledge', title: 'Knowledge lifecycle', script: 'verify:knowledge' },
  { id: 'architecture', title: 'Architecture observations', script: 'smells:arch' },
  { id: 'duplication', title: 'Duplication observations', script: 'duplication:report' },
  { id: 'dependencies', title: 'Production dependency audit', script: 'audit:prod' },
];

export class MaintenanceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MaintenanceError';
  }
}

export class MaintenanceService {
  constructor(
    private readonly root: string,
    private readonly runner: ProcessRunner = systemProcessRunner,
    private readonly locks: RepositoryLockStore = new FileRepositoryLockStore(root),
    private readonly steps: ReadonlyArray<MaintenanceStep> = maintenanceSteps,
  ) {}

  async runOnce(): Promise<MaintenanceResult> {
    const lease = await this.locks.acquire('maintenance', true);
    try {
      const results: MaintenanceStepResult[] = [];
      for (const step of this.steps) {
        const startedAt = performance.now();
        const invocation = npmInvocation(['run', step.script]);
        const result = await this.runner.run({
          ...invocation,
          cwd: this.root,
          stdio: 'inherit',
          timeoutMs: 15 * 60_000,
        });
        if (result.code !== 0 || result.signal || result.timedOut) {
          throw new MaintenanceError(
            'maintenance-step-failed',
            `Maintenance step '${step.id}' failed.`,
          );
        }
        results.push({ id: step.id, durationMs: Math.round(performance.now() - startedAt) });
      }
      return { steps: results };
    } finally {
      await lease.release();
    }
  }
}
