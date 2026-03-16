import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DelayedError, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../../libs/platform/db/prisma.service';
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
import type {
  UsersFinalizeAccountDeletionJobResult,
  UsersProfileImageDeleteStoredFileJobResult,
  UsersProfileImageExpireUploadJobResult,
  UsersQueueJobData,
  UsersQueueJobResult,
} from './users-account-deletion.contracts';
import {
  runDeleteProfileImageStoredFile,
  runExpireProfileImageUpload,
  runFinalizeAccountDeletionTx,
} from './users-account-deletion.handlers';

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

    if (isFinalizeAccountDeletionJob(job)) {
      return await this.finalize(job, token);
    }

    if (isDeleteProfileImageStoredFileJob(job)) {
      return await this.deleteProfileImageStoredFile(job);
    }

    if (isExpireProfileImageUploadJob(job)) {
      return await this.expireProfileImageUpload(job);
    }

    throw new Error(`Unknown job name "${job.name}" on queue "${USERS_QUEUE}"`);
  }

  private async finalize(
    job: Job<UsersFinalizeAccountDeletionJobData, UsersFinalizeAccountDeletionJobResult>,
    token: string,
  ): Promise<UsersFinalizeAccountDeletionJobResult> {
    const now = new Date();

    try {
      const res = await runFinalizeAccountDeletionTx(this.prisma, job, now);

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
    const now = new Date();
    return await runDeleteProfileImageStoredFile(this.prisma, this.storage, job, now);
  }

  private async expireProfileImageUpload(
    job: Job<UsersProfileImageExpireUploadJobData, UsersProfileImageExpireUploadJobResult>,
  ): Promise<UsersProfileImageExpireUploadJobResult> {
    const now = new Date();
    return await runExpireProfileImageUpload(this.prisma, this.storage, job, now);
  }
}

function isFinalizeAccountDeletionJob(
  job: Job<UsersQueueJobData, UsersQueueJobResult>,
): job is Job<UsersFinalizeAccountDeletionJobData, UsersFinalizeAccountDeletionJobResult> {
  return job.name === USERS_FINALIZE_ACCOUNT_DELETION_JOB;
}

function isDeleteProfileImageStoredFileJob(
  job: Job<UsersQueueJobData, UsersQueueJobResult>,
): job is Job<
  UsersProfileImageDeleteStoredFileJobData,
  UsersProfileImageDeleteStoredFileJobResult
> {
  return job.name === USERS_PROFILE_IMAGE_DELETE_STORED_FILE_JOB;
}

function isExpireProfileImageUploadJob(
  job: Job<UsersQueueJobData, UsersQueueJobResult>,
): job is Job<UsersProfileImageExpireUploadJobData, UsersProfileImageExpireUploadJobResult> {
  return job.name === USERS_PROFILE_IMAGE_EXPIRE_UPLOAD_JOB;
}
