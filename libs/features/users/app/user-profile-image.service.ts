import { randomUUID } from 'node:crypto';
import type { ObjectStorageService } from '../../../platform/storage/object-storage.service';
import type { PresignedPutObject } from '../../../platform/storage/object-storage.types';
import { UserNotFoundError, UsersError } from './users.errors';
import { UsersErrorCode } from './users.error-codes';
import type { ProfileImageRepository, StoredFileRecord } from './ports/profile-image.repository';

import {
  PROFILE_IMAGE_ALLOWED_CONTENT_TYPES,
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_GET_URL_TTL_SECONDS,
  PROFILE_IMAGE_PRESIGN_TTL_SECONDS,
} from './profile-image.policy';

export type ProfileImageUploadPlan = Readonly<{
  fileId: string;
  upload: PresignedPutObject;
  expiresAt: string;
}>;

export type ProfileImageUrlView = Readonly<{
  url: string;
  expiresAt: string;
}>;

function isAllowedContentType(
  value: string,
): value is (typeof PROFILE_IMAGE_ALLOWED_CONTENT_TYPES)[number] {
  return (PROFILE_IMAGE_ALLOWED_CONTENT_TYPES as readonly string[]).includes(value);
}

export class UserProfileImageService {
  constructor(
    private readonly repo: ProfileImageRepository,
    private readonly storage: ObjectStorageService,
  ) {}

  async createUploadPlan(input: {
    userId: string;
    contentType: string;
    sizeBytes: number;
    traceId: string;
  }): Promise<ProfileImageUploadPlan> {
    if (!this.storage.isEnabled()) {
      throw new UsersError({
        status: 501,
        code: UsersErrorCode.USERS_OBJECT_STORAGE_NOT_CONFIGURED,
        message: 'Object storage is not configured',
      });
    }

    const contentType = input.contentType.trim();
    if (!isAllowedContentType(contentType)) {
      throw new UsersError({
        status: 400,
        code: 'VALIDATION_FAILED',
        message: 'Unsupported contentType',
        issues: [
          {
            field: 'contentType',
            message: `Allowed: ${PROFILE_IMAGE_ALLOWED_CONTENT_TYPES.join(', ')}`,
          },
        ],
      });
    }

    const sizeBytes = Math.trunc(input.sizeBytes);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > PROFILE_IMAGE_MAX_BYTES) {
      throw new UsersError({
        status: 400,
        code: 'VALIDATION_FAILED',
        message: 'Invalid sizeBytes',
        issues: [
          { field: 'sizeBytes', message: `Must be between 1 and ${PROFILE_IMAGE_MAX_BYTES}` },
        ],
      });
    }

    const fileId = randomUUID();
    const objectKey = `users/${input.userId}/profile-images/${fileId}`;

    const bucket = this.storage.getBucketName();

    const upload = await this.storage.presignPutObject({
      key: objectKey,
      contentType,
      expiresInSeconds: PROFILE_IMAGE_PRESIGN_TTL_SECONDS,
    });

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + PROFILE_IMAGE_PRESIGN_TTL_SECONDS * 1000,
    ).toISOString();

    const created = await this.repo.createProfileImageFile({
      fileId,
      ownerUserId: input.userId,
      bucket,
      objectKey,
      contentType,
      sizeBytes,
      traceId: input.traceId,
      now,
    });

    if (created.kind === 'not_found') {
      throw new UserNotFoundError();
    }

    return { fileId, upload, expiresAt };
  }

  async completeUpload(input: { userId: string; fileId: string; traceId: string }): Promise<void> {
    if (!this.storage.isEnabled()) {
      throw new UsersError({
        status: 501,
        code: UsersErrorCode.USERS_OBJECT_STORAGE_NOT_CONFIGURED,
        message: 'Object storage is not configured',
      });
    }

    const record = await this.repo.findStoredFileForOwner(input.fileId, input.userId);
    if (!record) {
      throw new UsersError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'File not found',
      });
    }

    if (record.status === 'DELETED') {
      throw new UsersError({
        status: 409,
        code: UsersErrorCode.USERS_PROFILE_IMAGE_NOT_UPLOADED,
        message: 'Upload is not available',
      });
    }

    const attachedFileId = await this.repo.getProfileImageFileId(input.userId);
    if (record.status === 'ACTIVE' && attachedFileId === input.fileId) {
      return;
    }

    const head = await this.storage.headObject(record.objectKey);
    if (!head.exists) {
      throw new UsersError({
        status: 409,
        code: UsersErrorCode.USERS_PROFILE_IMAGE_NOT_UPLOADED,
        message: 'Upload not found',
      });
    }

    if (head.contentLength === undefined || head.contentLength !== record.sizeBytes) {
      await this.rejectUpload(record, input.userId);
      throw new UsersError({
        status: 409,
        code: UsersErrorCode.USERS_PROFILE_IMAGE_SIZE_MISMATCH,
        message: 'Uploaded file size does not match the expected size',
      });
    }

    if (head.contentType === undefined || head.contentType !== record.contentType) {
      await this.rejectUpload(record, input.userId);
      throw new UsersError({
        status: 409,
        code: UsersErrorCode.USERS_PROFILE_IMAGE_CONTENT_TYPE_MISMATCH,
        message: 'Uploaded file content type does not match the expected content type',
      });
    }

    const now = new Date();
    const attach = await this.repo.attachProfileImageFile({
      userId: input.userId,
      fileId: input.fileId,
      now,
    });

    if (attach.kind === 'not_found') {
      throw new UserNotFoundError();
    }

    if (attach.previousFileId && attach.previousFileId !== input.fileId) {
      await this.tryDeletePreviousFile(input.userId, attach.previousFileId, now);
    }
  }

  async clearProfileImage(input: { userId: string; traceId: string }): Promise<void> {
    const now = new Date();

    const cleared = await this.repo.clearProfileImage({ userId: input.userId, now });
    if (cleared.kind === 'not_found') {
      throw new UserNotFoundError();
    }

    if (!cleared.clearedFile) return;
    if (!this.storage.isEnabled()) return;

    try {
      await this.storage.deleteObject(cleared.clearedFile.objectKey);
    } catch {
      // best-effort; ignore
    }
  }

  async getProfileImageUrl(input: {
    userId: string;
    traceId: string;
  }): Promise<ProfileImageUrlView | null> {
    const current = await this.repo.getCurrentProfileImageFile(input.userId);
    if (current.kind === 'not_found') {
      throw new UserNotFoundError();
    }
    if (!current.file) return null;

    if (!this.storage.isEnabled()) {
      throw new UsersError({
        status: 501,
        code: UsersErrorCode.USERS_OBJECT_STORAGE_NOT_CONFIGURED,
        message: 'Object storage is not configured',
      });
    }

    const presigned = await this.storage.presignGetObject({
      key: current.file.objectKey,
      expiresInSeconds: PROFILE_IMAGE_GET_URL_TTL_SECONDS,
    });

    const expiresAt = new Date(Date.now() + PROFILE_IMAGE_GET_URL_TTL_SECONDS * 1000).toISOString();

    return { url: presigned.url, expiresAt };
  }

  private async rejectUpload(file: StoredFileRecord, ownerUserId: string): Promise<void> {
    const now = new Date();

    try {
      await this.storage.deleteObject(file.objectKey);
    } catch {
      // best-effort; ignore
    }

    try {
      await this.repo.markStoredFileDeleted({ fileId: file.id, ownerUserId, now });
    } catch {
      // best-effort; ignore
    }
  }

  private async tryDeletePreviousFile(
    ownerUserId: string,
    previousFileId: string,
    now: Date,
  ): Promise<void> {
    const old = await this.repo.findStoredFileForOwner(previousFileId, ownerUserId);
    if (!old) return;
    if (old.status === 'DELETED') return;

    try {
      await this.storage.deleteObject(old.objectKey);
    } catch {
      return;
    }

    try {
      await this.repo.markStoredFileDeleted({ fileId: old.id, ownerUserId, now });
    } catch {
      // best-effort; ignore
    }
  }
}
