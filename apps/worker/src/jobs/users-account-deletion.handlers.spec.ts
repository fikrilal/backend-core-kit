import { FilePurpose, FileStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import type { PrismaService } from '../../../../libs/platform/db/prisma.service';
import type { ObjectStorageService } from '../../../../libs/platform/storage/object-storage.service';
import type {
  UsersProfileImageDeleteStoredFileJobData,
  UsersProfileImageExpireUploadJobData,
} from '../../../../libs/features/users/infra/jobs/profile-image-cleanup.job';
import {
  runDeleteProfileImageStoredFile,
  runExpireProfileImageUpload,
} from './users-account-deletion.handlers';

describe('users-account-deletion.handlers', () => {
  it('skips stored-file delete when storage is disabled', async () => {
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const prisma = {
      getClient: () => ({
        storedFile: {
          findFirst: async () => ({
            id: 'file-1',
            purpose: FilePurpose.PROFILE_IMAGE,
            status: FileStatus.ACTIVE,
            objectKey: 'profile/file-1',
          }),
          updateMany,
        },
      }),
    } as unknown as PrismaService;

    const storage = {
      isEnabled: () => false,
      deleteObject: jest.fn(async () => undefined),
    } as unknown as ObjectStorageService;

    const job = {
      data: { fileId: 'file-1', ownerUserId: 'user-1', enqueuedAt: '2026-01-01T00:00:00.000Z' },
    } as Job<UsersProfileImageDeleteStoredFileJobData>;

    const result = await runDeleteProfileImageStoredFile(prisma, storage, job, new Date());
    expect(result).toEqual({
      ok: true,
      fileId: 'file-1',
      outcome: 'skipped',
      reason: 'storage_not_configured',
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('expires uploading file and reports storage_not_configured when storage is disabled', async () => {
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const prisma = {
      getClient: () => ({
        storedFile: {
          findFirst: async () => ({
            id: 'file-2',
            purpose: FilePurpose.PROFILE_IMAGE,
            status: FileStatus.UPLOADING,
            objectKey: 'profile/file-2',
          }),
          updateMany,
        },
      }),
    } as unknown as PrismaService;

    const storage = {
      isEnabled: () => false,
      deleteObject: jest.fn(async () => undefined),
    } as unknown as ObjectStorageService;

    const job = {
      data: {
        fileId: 'file-2',
        ownerUserId: 'user-2',
        enqueuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-01-01T01:00:00.000Z',
      },
    } as Job<UsersProfileImageExpireUploadJobData>;

    const result = await runExpireProfileImageUpload(prisma, storage, job, new Date());
    expect(result).toEqual({
      ok: true,
      fileId: 'file-2',
      outcome: 'expired',
      reason: 'storage_not_configured',
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
