import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../../../../libs/platform/db/prisma.service';
import { jobName } from '../../../../libs/platform/queue/job-name';
import type { JsonObject } from '../../../../libs/platform/queue/json.types';
import { queueName } from '../../../../libs/platform/queue/queue-name';
import { QueueWorkerFactory } from '../../../../libs/platform/queue/queue.worker';

type SystemSmokeJobData = {
  runId: string;
  requestedAt: string;
} & JsonObject;

type SystemSmokeJobResult = {
  ok: true;
  runId: string;
  db: 'ok';
  attemptsMade?: number;
} & JsonObject;

const SYSTEM_QUEUE = queueName('system');
const SYSTEM_SMOKE_JOB = jobName('system.smoke');
const SYSTEM_SMOKE_RETRY_JOB = jobName('system.smokeRetry');

@Injectable()
export class SystemSmokeWorker implements OnModuleInit {
  constructor(
    private readonly workers: QueueWorkerFactory,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Keep the worker process runnable in dev/test without Redis/DB unless configured.
    if (!this.workers.isEnabled() || !this.prisma.isEnabled()) return;

    this.workers.createWorker<SystemSmokeJobData, SystemSmokeJobResult>(
      SYSTEM_QUEUE,
      async (job) => this.process(job),
      { concurrency: 1 },
    );
  }

  private async process(
    job: Job<SystemSmokeJobData, SystemSmokeJobResult>,
  ): Promise<SystemSmokeJobResult> {
    if (job.name === SYSTEM_SMOKE_JOB) {
      await this.prisma.ping();
      return { ok: true, runId: job.data.runId, db: 'ok' };
    }

    if (job.name === SYSTEM_SMOKE_RETRY_JOB) {
      if (job.attemptsMade === 0) {
        throw new Error('Intentional failure for retry/backoff smoke test');
      }

      await this.prisma.ping();
      return { ok: true, runId: job.data.runId, db: 'ok', attemptsMade: job.attemptsMade };
    }

    throw new Error(`Unknown job name "${job.name}" on queue "${SYSTEM_QUEUE}"`);
  }
}
