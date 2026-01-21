import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../../libs/platform/db/prisma.service';
import { QueueWorkerFactory } from '../../../../libs/platform/queue/queue.worker';
import type { JsonObject } from '../../../../libs/platform/queue/json.types';
import {
  PUSH_QUEUE,
  PUSH_SEND_JOB,
  type PushSendJobData,
} from '../../../../libs/platform/push/push.job';
import { PUSH_SERVICE } from '../../../../libs/platform/push/push.tokens';
import type { PushService } from '../../../../libs/platform/push/push.service';
import { PushErrorCode, PushSendError } from '../../../../libs/platform/push/push.types';

type PushSendJobResult = Readonly<{
  ok: true;
  sessionId: string;
  outcome: 'sent' | 'skipped';
  reason?:
    | 'session_not_found'
    | 'session_revoked'
    | 'session_expired'
    | 'user_inactive'
    | 'no_token'
    | 'invalid_token';
  messageId?: string;
  providerCode?: string;
}> &
  JsonObject;

function isInvalidTokenCode(code: PushErrorCode): boolean {
  return code === PushErrorCode.InvalidToken;
}

@Injectable()
export class PushWorker implements OnModuleInit {
  constructor(
    private readonly workers: QueueWorkerFactory,
    @Inject(PUSH_SERVICE) private readonly push: PushService,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PushWorker.name);
  }

  async onModuleInit(): Promise<void> {
    if (!this.workers.isEnabled() || !this.prisma.isEnabled() || !this.push.isEnabled()) return;

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

    const now = new Date();
    const session = await this.prisma.getClient().session.findUnique({
      where: { id: job.data.sessionId },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
        pushToken: true,
        user: { select: { status: true } },
      },
    });

    if (!session) {
      return {
        ok: true,
        sessionId: job.data.sessionId,
        outcome: 'skipped',
        reason: 'session_not_found',
      };
    }

    if (session.revokedAt !== null) {
      return { ok: true, sessionId: session.id, outcome: 'skipped', reason: 'session_revoked' };
    }

    if (session.expiresAt.getTime() <= now.getTime()) {
      return { ok: true, sessionId: session.id, outcome: 'skipped', reason: 'session_expired' };
    }

    if (session.user.status !== 'ACTIVE') {
      return { ok: true, sessionId: session.id, outcome: 'skipped', reason: 'user_inactive' };
    }

    const token = session.pushToken ?? undefined;
    if (!token) {
      return { ok: true, sessionId: session.id, outcome: 'skipped', reason: 'no_token' };
    }

    try {
      const res = await this.push.sendToToken({
        token,
        notification: job.data.notification,
        data: job.data.data,
      });

      return { ok: true, sessionId: session.id, outcome: 'sent', messageId: res.messageId };
    } catch (err: unknown) {
      if (err instanceof PushSendError && !err.retryable && isInvalidTokenCode(err.code)) {
        await this.prisma.getClient().session.updateMany({
          where: { id: session.id, pushToken: token },
          data: {
            pushPlatform: null,
            pushToken: null,
            pushTokenUpdatedAt: now,
            pushTokenRevokedAt: now,
          },
        });

        const providerCode = err.providerCode ?? err.code;
        this.logger.info(
          { sessionId: session.id, providerCode },
          'Push send skipped: invalid token',
        );
        return {
          ok: true,
          sessionId: session.id,
          outcome: 'skipped',
          reason: 'invalid_token',
          ...(providerCode ? { providerCode } : {}),
        };
      }

      throw err;
    }
  }
}
