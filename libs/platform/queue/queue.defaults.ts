import type { JobsOptions } from 'bullmq';

export const DEFAULT_JOB_OPTIONS: Readonly<JobsOptions> = Object.freeze({
  attempts: 5,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
});
