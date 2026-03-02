import type { JobsOptions, WorkerOptions } from 'bullmq';

export const DEFAULT_JOB_OPTIONS: Readonly<JobsOptions> = Object.freeze({
  attempts: 5,
  backoff: { type: 'exponential', delay: 1000, jitter: 0.2 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
});

export const DEFAULT_WORKER_OPTIONS: Readonly<
  Pick<WorkerOptions, 'lockDuration' | 'stalledInterval' | 'maxStalledCount' | 'drainDelay'>
> = Object.freeze({
  lockDuration: 30_000,
  stalledInterval: 30_000,
  maxStalledCount: 1,
  drainDelay: 5,
});
