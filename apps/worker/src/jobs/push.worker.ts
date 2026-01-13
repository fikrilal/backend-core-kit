import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { QueueWorkerFactory } from '../../../../libs/platform/queue/queue.worker';
import type { JsonObject } from '../../../../libs/platform/queue/json.types';
import {
  PUSH_QUEUE,
  PUSH_SEND_JOB,
  type PushSendJobData,
} from '../../../../libs/platform/push/push.job';
import { PUSH_SERVICE } from '../../../../libs/platform/push/push.tokens';
import type { PushService } from '../../../../libs/platform/push/push.service';
import { PushSendError } from '../../../../libs/platform/push/push.types';

type PushSendJobResult = Readonly<{
  ok: true;
  outcome: 'sent' | 'skipped';
  reason?: 'invalid_token';
  messageId?: string;
  providerCode?: string;
}> &
  JsonObject;

function isInvalidTokenCode(code: string | undefined): boolean {
  return (
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/registration-token-not-registered' ||
    code === 'push/invalid-token'
  );
}

@Injectable()
export class PushWorker implements OnModuleInit {
  constructor(
    private readonly workers: QueueWorkerFactory,
    @Inject(PUSH_SERVICE) private readonly push: PushService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PushWorker.name);
  }

  async onModuleInit(): Promise<void> {
    if (!this.workers.isEnabled() || !this.push.isEnabled()) return;

    this.workers.createWorker<PushSendJobData, PushSendJobResult>(
      PUSH_QUEUE,
      async (job) => this.process(job),
      { concurrency: 5 },
    );
  }

  private async process(job: Job<PushSendJobData, PushSendJobResult>): Promise<PushSendJobResult> {
    if (job.name !== PUSH_SEND_JOB) {
      throw new Error(`Unknown job name "${job.name}" on queue "${PUSH_QUEUE}"`);
    }

    try {
      const res = await this.push.sendToToken({
        token: job.data.token,
        notification: job.data.notification,
        data: job.data.data,
      });

      return { ok: true, outcome: 'sent', messageId: res.messageId };
    } catch (err: unknown) {
      if (err instanceof PushSendError && !err.retryable && isInvalidTokenCode(err.code)) {
        this.logger.info({ providerCode: err.code }, 'Push send skipped: invalid token');
        return {
          ok: true,
          outcome: 'skipped',
          reason: 'invalid_token',
          ...(err.code ? { providerCode: err.code } : {}),
        };
      }

      throw err;
    }
  }
}
