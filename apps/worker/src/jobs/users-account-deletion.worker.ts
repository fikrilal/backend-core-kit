import { Injectable, type OnModuleInit } from '@nestjs/common';
import { Prisma, UserRole as PrismaUserRole, UserStatus as PrismaUserStatus } from '@prisma/client';
import { DelayedError, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../../libs/platform/db/prisma.service';
import type { JsonObject } from '../../../../libs/platform/queue/json.types';
import { QueueWorkerFactory } from '../../../../libs/platform/queue/queue.worker';
import {
  USERS_FINALIZE_ACCOUNT_DELETION_JOB,
  USERS_QUEUE,
  type UsersFinalizeAccountDeletionJobData,
} from '../../../../libs/features/users/infra/jobs/user-account-deletion.job';

type UsersFinalizeAccountDeletionJobResult = Readonly<{
  ok: true;
  userId: string;
  outcome: 'finalized' | 'skipped';
  reason?:
    | 'user_not_found'
    | 'already_deleted'
    | 'not_scheduled'
    | 'not_due'
    | 'blocked_last_admin';
  deletedAt?: string;
  rescheduledUntil?: string;
}> &
  JsonObject;

@Injectable()
export class UsersAccountDeletionWorker implements OnModuleInit {
  constructor(
    private readonly workers: QueueWorkerFactory,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsersAccountDeletionWorker.name);
  }

  async onModuleInit(): Promise<void> {
    // Keep the worker process runnable in dev/test without Redis/DB unless configured.
    if (!this.workers.isEnabled() || !this.prisma.isEnabled()) return;

    this.workers.createWorker<
      UsersFinalizeAccountDeletionJobData,
      UsersFinalizeAccountDeletionJobResult
    >(USERS_QUEUE, async (job, token) => this.process(job, token), { concurrency: 2 });
  }

  private async process(
    job: Job<UsersFinalizeAccountDeletionJobData, UsersFinalizeAccountDeletionJobResult>,
    token: string | undefined,
  ): Promise<UsersFinalizeAccountDeletionJobResult> {
    if (job.name !== USERS_FINALIZE_ACCOUNT_DELETION_JOB) {
      throw new Error(`Unknown job name "${job.name}" on queue "${USERS_QUEUE}"`);
    }

    if (!token) {
      throw new Error('Missing job lock token');
    }

    return await this.finalize(job, token);
  }

  private async finalize(
    job: Job<UsersFinalizeAccountDeletionJobData, UsersFinalizeAccountDeletionJobResult>,
    token: string,
  ): Promise<UsersFinalizeAccountDeletionJobResult> {
    const now = new Date();
    const client = this.prisma.getClient();

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const res = await client.$transaction(
          async (tx) => {
            const user = await tx.user.findUnique({
              where: { id: job.data.userId },
              select: {
                id: true,
                email: true,
                role: true,
                status: true,
                deletionRequestedAt: true,
                deletionScheduledFor: true,
                deletionRequestedSessionId: true,
                deletionRequestedTraceId: true,
                deletedAt: true,
              },
            });

            if (!user) {
              return { kind: 'skipped', reason: 'user_not_found' } as const;
            }

            if (user.status === PrismaUserStatus.DELETED || user.deletedAt !== null) {
              return { kind: 'skipped', reason: 'already_deleted', userId: user.id } as const;
            }

            const scheduledFor = user.deletionScheduledFor;
            if (!scheduledFor) {
              return { kind: 'skipped', reason: 'not_scheduled', userId: user.id } as const;
            }

            if (scheduledFor.getTime() > now.getTime()) {
              return {
                kind: 'not_due',
                userId: user.id,
                scheduledFor,
              } as const;
            }

            if (user.role === PrismaUserRole.ADMIN && user.status === PrismaUserStatus.ACTIVE) {
              const activeAdminCount = await tx.user.count({
                where: { role: PrismaUserRole.ADMIN, status: PrismaUserStatus.ACTIVE },
              });
              if (activeAdminCount <= 1) {
                const traceId =
                  user.deletionRequestedTraceId ??
                  (typeof job.id === 'string' ? `job:${job.id}` : 'unknown');
                const actorSessionId = user.deletionRequestedSessionId;
                if (!actorSessionId) {
                  throw new Error('Invariant violated: missing deletionRequestedSessionId');
                }

                await tx.userAccountDeletionAudit.create({
                  data: {
                    actorUserId: user.id,
                    actorSessionId,
                    targetUserId: user.id,
                    action: 'FINALIZE_BLOCKED_LAST_ADMIN',
                    traceId,
                  },
                  select: { id: true },
                });

                return { kind: 'blocked_last_admin', userId: user.id } as const;
              }
            }

            const traceId =
              user.deletionRequestedTraceId ??
              (typeof job.id === 'string' ? `job:${job.id}` : 'unknown');
            const actorSessionId = user.deletionRequestedSessionId;
            if (!actorSessionId) {
              throw new Error('Invariant violated: missing deletionRequestedSessionId');
            }

            const scrubbedEmail = `deleted+${user.id}@example.invalid`;

            await tx.user.update({
              where: { id: user.id },
              data: {
                email: scrubbedEmail,
                emailVerifiedAt: null,
                role: PrismaUserRole.USER,
                status: PrismaUserStatus.DELETED,
                deletedAt: now,
                deletionRequestedAt: null,
                deletionScheduledFor: null,
                deletionRequestedSessionId: null,
                deletionRequestedTraceId: null,
                suspendedAt: null,
                suspendedReason: null,
              },
              select: { id: true },
            });

            await tx.userProfile.updateMany({
              where: { userId: user.id },
              data: { displayName: null, givenName: null, familyName: null },
            });

            await tx.passwordCredential.deleteMany({ where: { userId: user.id } });
            await tx.externalIdentity.deleteMany({ where: { userId: user.id } });
            await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } });
            await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });

            // Sessions contain device identifiers; drop them entirely.
            await tx.session.deleteMany({ where: { userId: user.id } });

            await tx.userStatusChangeAudit.create({
              data: {
                actorUserId: user.id,
                actorSessionId,
                targetUserId: user.id,
                oldStatus: user.status,
                newStatus: PrismaUserStatus.DELETED,
                reason: null,
                traceId,
              },
              select: { id: true },
            });

            await tx.userAccountDeletionAudit.create({
              data: {
                actorUserId: user.id,
                actorSessionId,
                targetUserId: user.id,
                action: 'FINALIZED',
                traceId,
              },
              select: { id: true },
            });

            return { kind: 'finalized', userId: user.id } as const;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        if (res.kind === 'not_due') {
          await job.moveToDelayed(res.scheduledFor.getTime(), token);
          throw new DelayedError();
        }

        if (res.kind === 'blocked_last_admin') {
          const nextAttempt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          await job.moveToDelayed(nextAttempt.getTime(), token);
          throw new DelayedError();
        }

        if (res.kind === 'finalized') {
          this.logger.info({ userId: res.userId }, 'Account deletion finalized');
          return {
            ok: true,
            userId: res.userId,
            outcome: 'finalized',
            deletedAt: now.toISOString(),
          };
        }

        this.logger.info(
          { userId: job.data.userId, reason: res.reason },
          'Account deletion skipped',
        );
        return {
          ok: true,
          userId: job.data.userId,
          outcome: 'skipped',
          reason: res.reason,
        };
      } catch (err: unknown) {
        if (err instanceof DelayedError) {
          // The job state is already moved to delayed; keep the worker loop going.
          throw err;
        }

        if (attempt < maxAttempts && isRetryableTransactionError(err)) {
          continue;
        }

        throw err;
      }
    }

    throw new Error('Unexpected: exhausted transaction retries');
  }
}

function isRetryableTransactionError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return err.code === 'P2034';
}
