import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  FilePurpose as PrismaFilePurpose,
  FileStatus as PrismaFileStatus,
  Prisma,
  UserRole as PrismaUserRole,
  UserStatus as PrismaUserStatus,
} from '@prisma/client';
import { DelayedError, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../../libs/platform/db/prisma.service';
import { lockActiveAdminInvariant } from '../../../../libs/platform/db/row-locks';
import { withTransactionRetry } from '../../../../libs/platform/db/tx-retry';
import type { JsonObject } from '../../../../libs/platform/queue/json.types';
import { QueueWorkerFactory } from '../../../../libs/platform/queue/queue.worker';
import { ObjectStorageService } from '../../../../libs/platform/storage/object-storage.service';
import {
  USERS_PROFILE_IMAGE_DELETE_STORED_FILE_JOB,
  USERS_PROFILE_IMAGE_EXPIRE_UPLOAD_JOB,
  type UsersProfileImageDeleteStoredFileJobData,
  type UsersProfileImageExpireUploadJobData,
} from '../../../../libs/features/users/infra/jobs/profile-image-cleanup.job';
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

type UsersProfileImageDeleteStoredFileJobResult = Readonly<{
  ok: true;
  fileId: string;
  outcome: 'deleted' | 'skipped';
  reason?: 'file_not_found' | 'storage_not_configured' | 'not_profile_image';
}> &
  JsonObject;

type UsersProfileImageExpireUploadJobResult = Readonly<{
  ok: true;
  fileId: string;
  outcome: 'expired' | 'skipped';
  reason?: 'file_not_found' | 'not_profile_image' | 'not_uploading' | 'storage_not_configured';
}> &
  JsonObject;

type UsersQueueJobData =
  | UsersFinalizeAccountDeletionJobData
  | UsersProfileImageDeleteStoredFileJobData
  | UsersProfileImageExpireUploadJobData;

type UsersQueueJobResult =
  | UsersFinalizeAccountDeletionJobResult
  | UsersProfileImageDeleteStoredFileJobResult
  | UsersProfileImageExpireUploadJobResult;

@Injectable()
export class UsersAccountDeletionWorker implements OnModuleInit {
  constructor(
    private readonly workers: QueueWorkerFactory,
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsersAccountDeletionWorker.name);
  }

  async onModuleInit(): Promise<void> {
    // Keep the worker process runnable in dev/test without Redis/DB unless configured.
    if (!this.workers.isEnabled() || !this.prisma.isEnabled()) return;

    this.workers.createWorker<UsersQueueJobData, UsersQueueJobResult>(
      USERS_QUEUE,
      async (job, token) => this.process(job, token),
      { concurrency: 2 },
    );
  }

  private async process(
    job: Job<UsersQueueJobData, UsersQueueJobResult>,
    token: string | undefined,
  ): Promise<UsersQueueJobResult> {
    if (!token) {
      throw new Error('Missing job lock token');
    }

    switch (job.name) {
      case USERS_FINALIZE_ACCOUNT_DELETION_JOB:
        return await this.finalize(
          job as Job<UsersFinalizeAccountDeletionJobData, UsersFinalizeAccountDeletionJobResult>,
          token,
        );
      case USERS_PROFILE_IMAGE_DELETE_STORED_FILE_JOB:
        return await this.deleteProfileImageStoredFile(
          job as Job<
            UsersProfileImageDeleteStoredFileJobData,
            UsersProfileImageDeleteStoredFileJobResult
          >,
        );
      case USERS_PROFILE_IMAGE_EXPIRE_UPLOAD_JOB:
        return await this.expireProfileImageUpload(
          job as Job<UsersProfileImageExpireUploadJobData, UsersProfileImageExpireUploadJobResult>,
        );
      default:
        throw new Error(`Unknown job name "${job.name}" on queue "${USERS_QUEUE}"`);
    }
  }

  private async finalize(
    job: Job<UsersFinalizeAccountDeletionJobData, UsersFinalizeAccountDeletionJobResult>,
    token: string,
  ): Promise<UsersFinalizeAccountDeletionJobResult> {
    const now = new Date();
    const client = this.prisma.getClient();

    try {
      const res = await withTransactionRetry(
        client,
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
            const activeAdminCount = await lockActiveAdminInvariant(tx);
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
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
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

      this.logger.info({ userId: job.data.userId, reason: res.reason }, 'Account deletion skipped');
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

      throw err;
    }
  }

  private async deleteProfileImageStoredFile(
    job: Job<UsersProfileImageDeleteStoredFileJobData, UsersProfileImageDeleteStoredFileJobResult>,
  ): Promise<UsersProfileImageDeleteStoredFileJobResult> {
    const client = this.prisma.getClient();
    const now = new Date();

    const file = await client.storedFile.findFirst({
      where: {
        id: job.data.fileId,
        ownerUserId: job.data.ownerUserId,
      },
      select: { id: true, purpose: true, status: true, objectKey: true },
    });

    if (!file) {
      return { ok: true, fileId: job.data.fileId, outcome: 'skipped', reason: 'file_not_found' };
    }

    if (file.purpose !== PrismaFilePurpose.PROFILE_IMAGE) {
      return {
        ok: true,
        fileId: file.id,
        outcome: 'skipped',
        reason: 'not_profile_image',
      };
    }

    if (!this.storage.isEnabled()) {
      return {
        ok: true,
        fileId: file.id,
        outcome: 'skipped',
        reason: 'storage_not_configured',
      };
    }

    await this.storage.deleteObject(file.objectKey);

    await client.storedFile.updateMany({
      where: {
        id: file.id,
        ownerUserId: job.data.ownerUserId,
        status: { not: PrismaFileStatus.DELETED },
      },
      data: { status: PrismaFileStatus.DELETED, deletedAt: now },
    });

    return { ok: true, fileId: file.id, outcome: 'deleted' };
  }

  private async expireProfileImageUpload(
    job: Job<UsersProfileImageExpireUploadJobData, UsersProfileImageExpireUploadJobResult>,
  ): Promise<UsersProfileImageExpireUploadJobResult> {
    const client = this.prisma.getClient();
    const now = new Date();

    const file = await client.storedFile.findFirst({
      where: {
        id: job.data.fileId,
        ownerUserId: job.data.ownerUserId,
      },
      select: { id: true, purpose: true, status: true, objectKey: true },
    });

    if (!file) {
      return { ok: true, fileId: job.data.fileId, outcome: 'skipped', reason: 'file_not_found' };
    }

    if (file.purpose !== PrismaFilePurpose.PROFILE_IMAGE) {
      return { ok: true, fileId: file.id, outcome: 'skipped', reason: 'not_profile_image' };
    }

    if (file.status !== PrismaFileStatus.UPLOADING) {
      return { ok: true, fileId: file.id, outcome: 'skipped', reason: 'not_uploading' };
    }

    if (this.storage.isEnabled()) {
      await this.storage.deleteObject(file.objectKey);
    }

    await client.storedFile.updateMany({
      where: {
        id: file.id,
        ownerUserId: job.data.ownerUserId,
        status: { not: PrismaFileStatus.DELETED },
      },
      data: { status: PrismaFileStatus.DELETED, deletedAt: now },
    });

    return {
      ok: true,
      fileId: file.id,
      outcome: 'expired',
      ...(this.storage.isEnabled() ? {} : { reason: 'storage_not_configured' }),
    };
  }
}
