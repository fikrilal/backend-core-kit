import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueProducer } from '../../../../platform/queue/queue.producer';
import { ObjectStorageService } from '../../../../platform/storage/object-storage.service';
import {
  deleteStoredFileJobId,
  expireUploadJobId,
  USERS_PROFILE_IMAGE_DELETE_STORED_FILE_JOB,
  USERS_PROFILE_IMAGE_EXPIRE_UPLOAD_JOB,
  USERS_QUEUE,
  type UsersProfileImageDeleteStoredFileJobData,
  type UsersProfileImageExpireUploadJobData,
} from './profile-image-cleanup.job';
import { PrismaProfileImageRepository } from '../persistence/prisma-profile-image.repository';

@Injectable()
export class ProfileImageCleanupJobs {
  private readonly expireDelaySeconds: number;

  constructor(
    private readonly queue: QueueProducer,
    private readonly config: ConfigService,
    private readonly repo: PrismaProfileImageRepository,
    private readonly storage: ObjectStorageService,
  ) {
    this.expireDelaySeconds =
      this.config.get<number>('USERS_PROFILE_IMAGE_UPLOAD_EXPIRE_DELAY_SECONDS') ?? 2 * 60 * 60;
  }

  isEnabled(): boolean {
    return this.queue.isEnabled();
  }

  async enqueueDeleteStoredFile(ownerUserId: string, fileId: string): Promise<boolean> {
    if (this.queue.isEnabled()) {
      const jobId = deleteStoredFileJobId(fileId);
      await this.queue.removeJob(USERS_QUEUE, jobId);

      const now = new Date();
      const data: UsersProfileImageDeleteStoredFileJobData = {
        fileId,
        ownerUserId,
        enqueuedAt: now.toISOString(),
      };

      await this.queue.enqueue(USERS_QUEUE, USERS_PROFILE_IMAGE_DELETE_STORED_FILE_JOB, data, {
        jobId,
      });

      return true;
    }

    return await this.tryInlineDelete(ownerUserId, fileId);
  }

  async scheduleExpireUpload(ownerUserId: string, fileId: string): Promise<boolean> {
    if (!this.queue.isEnabled()) return false;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.expireDelaySeconds * 1000);
    const jobId = expireUploadJobId(fileId);

    await this.queue.removeJob(USERS_QUEUE, jobId);

    const data: UsersProfileImageExpireUploadJobData = {
      fileId,
      ownerUserId,
      enqueuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await this.queue.enqueue(USERS_QUEUE, USERS_PROFILE_IMAGE_EXPIRE_UPLOAD_JOB, data, {
      jobId,
      delay: this.expireDelaySeconds * 1000,
    });

    return true;
  }

  private async tryInlineDelete(ownerUserId: string, fileId: string): Promise<boolean> {
    if (!this.storage.isEnabled()) return false;

    const file = await this.repo.findStoredFileForOwner(fileId, ownerUserId);
    if (!file) return false;

    try {
      await this.storage.deleteObject(file.objectKey);
    } catch {
      // best-effort only; ignore failures
    }

    try {
      await this.repo.markStoredFileDeleted({ fileId, ownerUserId, now: new Date() });
    } catch {
      // best-effort only; ignore failures
    }

    return true;
  }
}
