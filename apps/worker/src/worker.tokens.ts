import type { Clock } from '../../../libs/shared/time';

export const WORKER_CLOCK = Symbol('WORKER_CLOCK');

export type WorkerClock = Clock;
