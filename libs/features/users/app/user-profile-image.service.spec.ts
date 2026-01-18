import { UserProfileImageService } from './user-profile-image.service';
import { UserNotFoundError, type UsersError } from './users.errors';
import { UsersErrorCode } from './users.error-codes';
import type { ProfileImageRepository, StoredFileRecord } from './ports/profile-image.repository';
import type { ObjectStorageService } from '../../../platform/storage/object-storage.service';
import type {
  HeadObjectResult,
  PresignedGetObject,
  PresignedPutObject,
} from '../../../platform/storage/object-storage.types';
import {
  PROFILE_IMAGE_GET_URL_TTL_SECONDS,
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_PRESIGN_TTL_SECONDS,
} from './profile-image.policy';

function unimplemented(): never {
  throw new Error('Not implemented');
}

async function withFakeTime<T>(now: Date, fn: () => Promise<T> | T): Promise<T> {
  jest.useFakeTimers();
  jest.setSystemTime(now);
  try {
    return await fn();
  } finally {
    jest.useRealTimers();
  }
}

function makeRepo(overrides: Partial<ProfileImageRepository>): ProfileImageRepository {
  return {
    createProfileImageFile: async () => unimplemented(),
    findStoredFileForOwner: async () => unimplemented(),
    getProfileImageFileId: async () => unimplemented(),
    attachProfileImageFile: async () => unimplemented(),
    clearProfileImage: async () => unimplemented(),
    getCurrentProfileImageFile: async () => unimplemented(),
    markStoredFileDeleted: async () => unimplemented(),
    ...overrides,
  };
}

type StorageLike = Readonly<{
  isEnabled: () => boolean;
  getBucketName: () => string;
  presignPutObject: (input: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }) => Promise<PresignedPutObject>;
  presignGetObject: (input: {
    key: string;
    expiresInSeconds: number;
  }) => Promise<PresignedGetObject>;
  headObject: (key: string) => Promise<HeadObjectResult>;
  deleteObject: (key: string) => Promise<void>;
}>;

function asObjectStorageService(storage: StorageLike): ObjectStorageService {
  return storage as unknown as ObjectStorageService;
}

function makeStoredFile(partial?: Partial<StoredFileRecord>): StoredFileRecord {
  return {
    id: 'file-1',
    status: 'UPLOADING',
    bucket: 'bucket-1',
    objectKey: 'users/user-1/profile-images/file-1',
    contentType: 'image/png',
    sizeBytes: 123,
    uploadedAt: null,
    ...partial,
  };
}

describe('UserProfileImageService', () => {
  it('createUploadPlan throws USERS_OBJECT_STORAGE_NOT_CONFIGURED when storage is disabled', async () => {
    const repo = makeRepo({});
    const storage = asObjectStorageService({
      isEnabled: () => false,
      getBucketName: () => unimplemented(),
      presignPutObject: async () => unimplemented(),
      presignGetObject: async () => unimplemented(),
      headObject: async () => unimplemented(),
      deleteObject: async () => unimplemented(),
    });

    const service = new UserProfileImageService(repo, storage);

    await expect(
      service.createUploadPlan({
        userId: 'user-1',
        contentType: 'image/png',
        sizeBytes: 123,
        traceId: 'trace-1',
      }),
    ).rejects.toMatchObject({
      status: 501,
      code: UsersErrorCode.USERS_OBJECT_STORAGE_NOT_CONFIGURED,
    } satisfies Partial<UsersError>);
  });

  it('createUploadPlan trims contentType, validates input, and persists an UPLOADING file record', async () => {
    const presigned: PresignedPutObject = {
      method: 'PUT',
      url: 'https://example.com/upload',
      headers: { 'Content-Type': 'image/png' },
    };

    let presignInput: { key: string; contentType: string; expiresInSeconds: number } | undefined;
    let createdInput:
      | {
          fileId: string;
          ownerUserId: string;
          bucket: string;
          objectKey: string;
          contentType: string;
          sizeBytes: number;
          traceId: string;
          now: Date;
        }
      | undefined;

    const repo = makeRepo({
      createProfileImageFile: async (input) => {
        createdInput = input;
        return { kind: 'ok' };
      },
    });

    const storage = asObjectStorageService({
      isEnabled: () => true,
      getBucketName: () => 'bucket-1',
      presignPutObject: async (input) => {
        presignInput = input;
        return presigned;
      },
      presignGetObject: async () => unimplemented(),
      headObject: async () => unimplemented(),
      deleteObject: async () => unimplemented(),
    });

    const service = new UserProfileImageService(repo, storage);

    await withFakeTime(new Date('2026-01-01T00:00:00.000Z'), async () => {
      const res = await service.createUploadPlan({
        userId: 'user-1',
        contentType: ' image/png ',
        sizeBytes: 123.9,
        traceId: 'trace-1',
      });

      expect(res.upload).toEqual(presigned);

      expect(presignInput).toBeDefined();
      expect(presignInput?.contentType).toBe('image/png');
      expect(presignInput?.expiresInSeconds).toBe(PROFILE_IMAGE_PRESIGN_TTL_SECONDS);

      expect(createdInput).toBeDefined();
      expect(createdInput?.ownerUserId).toBe('user-1');
      expect(createdInput?.bucket).toBe('bucket-1');
      expect(createdInput?.contentType).toBe('image/png');
      expect(createdInput?.sizeBytes).toBe(123);
      expect(createdInput?.traceId).toBe('trace-1');
      expect(createdInput?.now.getTime()).toBe(new Date('2026-01-01T00:00:00.000Z').getTime());

      expect(res.fileId).toBe(createdInput?.fileId);
      expect(presignInput?.key).toBe(`users/user-1/profile-images/${res.fileId}`);
      expect(createdInput?.objectKey).toBe(`users/user-1/profile-images/${res.fileId}`);

      const expectedExpiresAt = new Date(
        new Date('2026-01-01T00:00:00.000Z').getTime() + PROFILE_IMAGE_PRESIGN_TTL_SECONDS * 1000,
      ).toISOString();
      expect(res.expiresAt).toBe(expectedExpiresAt);
    });
  });

  it('createUploadPlan rejects unsupported contentType with VALIDATION_FAILED', async () => {
    const repo = makeRepo({});
    const storage = asObjectStorageService({
      isEnabled: () => true,
      getBucketName: () => 'bucket-1',
      presignPutObject: async () => unimplemented(),
      presignGetObject: async () => unimplemented(),
      headObject: async () => unimplemented(),
      deleteObject: async () => unimplemented(),
    });

    const service = new UserProfileImageService(repo, storage);

    await expect(
      service.createUploadPlan({
        userId: 'user-1',
        contentType: 'image/gif',
        sizeBytes: 123,
        traceId: 'trace-1',
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      issues: expect.arrayContaining([{ field: 'contentType', message: expect.any(String) }]),
    });
  });

  it('createUploadPlan rejects invalid sizeBytes with VALIDATION_FAILED', async () => {
    const repo = makeRepo({});
    const storage = asObjectStorageService({
      isEnabled: () => true,
      getBucketName: () => 'bucket-1',
      presignPutObject: async () => unimplemented(),
      presignGetObject: async () => unimplemented(),
      headObject: async () => unimplemented(),
      deleteObject: async () => unimplemented(),
    });

    const service = new UserProfileImageService(repo, storage);

    await expect(
      service.createUploadPlan({
        userId: 'user-1',
        contentType: 'image/png',
        sizeBytes: PROFILE_IMAGE_MAX_BYTES + 1,
        traceId: 'trace-1',
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      issues: expect.arrayContaining([{ field: 'sizeBytes', message: expect.any(String) }]),
    });
  });

  it('createUploadPlan throws UserNotFoundError when repository returns not_found', async () => {
    const repo = makeRepo({
      createProfileImageFile: async () => ({ kind: 'not_found' }),
    });
    const storage = asObjectStorageService({
      isEnabled: () => true,
      getBucketName: () => 'bucket-1',
      presignPutObject: async () => ({
        method: 'PUT',
        url: 'https://example.com/upload',
        headers: { 'Content-Type': 'image/png' },
      }),
      presignGetObject: async () => unimplemented(),
      headObject: async () => unimplemented(),
      deleteObject: async () => unimplemented(),
    });

    const service = new UserProfileImageService(repo, storage);

    await expect(
      service.createUploadPlan({
        userId: 'missing',
        contentType: 'image/png',
        sizeBytes: 123,
        traceId: 'trace-1',
      }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('completeUpload returns null without hitting storage when the file is already attached', async () => {
    const record = makeStoredFile({ id: 'file-1', status: 'ACTIVE' });

    let headCalls = 0;
    let attachCalls = 0;

    const repo = makeRepo({
      findStoredFileForOwner: async () => record,
      getProfileImageFileId: async () => 'file-1',
      attachProfileImageFile: async () => {
        attachCalls += 1;
        return unimplemented();
      },
    });

    const storage = asObjectStorageService({
      isEnabled: () => true,
      getBucketName: () => 'bucket-1',
      presignPutObject: async () => unimplemented(),
      presignGetObject: async () => unimplemented(),
      headObject: async () => {
        headCalls += 1;
        return unimplemented();
      },
      deleteObject: async () => unimplemented(),
    });

    const service = new UserProfileImageService(repo, storage);

    const res = await service.completeUpload({ userId: 'user-1', fileId: 'file-1', traceId: 't' });

    expect(res).toBeNull();
    expect(headCalls).toBe(0);
    expect(attachCalls).toBe(0);
  });

  it('completeUpload rejects size mismatches and best-effort rejects the upload', async () => {
    const record = makeStoredFile({
      id: 'file-1',
      status: 'UPLOADING',
      objectKey: 'users/user-1/profile-images/file-1',
      contentType: 'image/png',
      sizeBytes: 123,
    });

    const deletedKeys: string[] = [];
    let deletedRecord:
      | {
          fileId: string;
          ownerUserId: string;
          now: Date;
        }
      | undefined;

    const repo = makeRepo({
      findStoredFileForOwner: async () => record,
      getProfileImageFileId: async () => null,
      markStoredFileDeleted: async (input) => {
        deletedRecord = input;
      },
    });

    const storage = asObjectStorageService({
      isEnabled: () => true,
      getBucketName: () => 'bucket-1',
      presignPutObject: async () => unimplemented(),
      presignGetObject: async () => unimplemented(),
      headObject: async () => ({
        exists: true,
        contentType: 'image/png',
        contentLength: 124,
      }),
      deleteObject: async (key) => {
        deletedKeys.push(key);
      },
    });

    const service = new UserProfileImageService(repo, storage);

    await withFakeTime(new Date('2026-01-01T00:00:00.000Z'), async () => {
      await expect(
        service.completeUpload({ userId: 'user-1', fileId: 'file-1', traceId: 't' }),
      ).rejects.toMatchObject({
        status: 409,
        code: UsersErrorCode.USERS_PROFILE_IMAGE_SIZE_MISMATCH,
      } satisfies Partial<UsersError>);
    });

    expect(deletedKeys).toEqual(['users/user-1/profile-images/file-1']);
    expect(deletedRecord?.fileId).toBe('file-1');
    expect(deletedRecord?.ownerUserId).toBe('user-1');
    expect(deletedRecord?.now.getTime()).toBe(new Date('2026-01-01T00:00:00.000Z').getTime());
  });

  it('completeUpload attaches the uploaded file and returns previousFileId when it changes', async () => {
    const record = makeStoredFile({
      id: 'file-2',
      status: 'UPLOADING',
      objectKey: 'users/user-1/profile-images/file-2',
      contentType: 'image/png',
      sizeBytes: 123,
    });

    let attachNow: Date | undefined;

    const repo = makeRepo({
      findStoredFileForOwner: async () => record,
      getProfileImageFileId: async () => null,
      attachProfileImageFile: async (input) => {
        attachNow = input.now;
        return { kind: 'ok', previousFileId: 'file-1' };
      },
    });

    const storage = asObjectStorageService({
      isEnabled: () => true,
      getBucketName: () => 'bucket-1',
      presignPutObject: async () => unimplemented(),
      presignGetObject: async () => unimplemented(),
      headObject: async () => ({
        exists: true,
        contentType: 'image/png',
        contentLength: 123,
      }),
      deleteObject: async () => unimplemented(),
    });

    const service = new UserProfileImageService(repo, storage);

    await withFakeTime(new Date('2026-01-01T00:00:00.000Z'), async () => {
      const res = await service.completeUpload({
        userId: 'user-1',
        fileId: 'file-2',
        traceId: 't',
      });
      expect(res).toBe('file-1');
    });

    expect(attachNow?.getTime()).toBe(new Date('2026-01-01T00:00:00.000Z').getTime());
  });

  it('getProfileImageUrl returns null when no profile image is set (even if storage is disabled)', async () => {
    const repo = makeRepo({
      getCurrentProfileImageFile: async () => ({ kind: 'ok', file: null }),
    });
    const storage = asObjectStorageService({
      isEnabled: () => false,
      getBucketName: () => unimplemented(),
      presignPutObject: async () => unimplemented(),
      presignGetObject: async () => unimplemented(),
      headObject: async () => unimplemented(),
      deleteObject: async () => unimplemented(),
    });

    const service = new UserProfileImageService(repo, storage);

    await expect(
      service.getProfileImageUrl({ userId: 'user-1', traceId: 't' }),
    ).resolves.toBeNull();
  });

  it('getProfileImageUrl returns a presigned GET url with expiresAt', async () => {
    const repo = makeRepo({
      getCurrentProfileImageFile: async () => ({
        kind: 'ok',
        file: { id: 'file-1', objectKey: 'users/user-1/profile-images/file-1' },
      }),
    });

    const presigned: PresignedGetObject = { url: 'https://example.com/get' };

    let presignGetKey: string | undefined;

    const storage = asObjectStorageService({
      isEnabled: () => true,
      getBucketName: () => 'bucket-1',
      presignPutObject: async () => unimplemented(),
      presignGetObject: async (input) => {
        presignGetKey = input.key;
        return presigned;
      },
      headObject: async () => unimplemented(),
      deleteObject: async () => unimplemented(),
    });

    const service = new UserProfileImageService(repo, storage);

    await withFakeTime(new Date('2026-01-01T00:00:00.000Z'), async () => {
      const res = await service.getProfileImageUrl({ userId: 'user-1', traceId: 't' });
      expect(res).toBeDefined();
      expect(res?.url).toBe('https://example.com/get');

      const expectedExpiresAt = new Date(
        new Date('2026-01-01T00:00:00.000Z').getTime() + PROFILE_IMAGE_GET_URL_TTL_SECONDS * 1000,
      ).toISOString();
      expect(res?.expiresAt).toBe(expectedExpiresAt);
    });

    expect(presignGetKey).toBe('users/user-1/profile-images/file-1');
  });
});
