import { Injectable } from '@nestjs/common';
import {
  FilePurpose as PrismaFilePurpose,
  FileStatus as PrismaFileStatus,
  UserStatus as PrismaUserStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../platform/db/prisma.service';
import type {
  AttachProfileImageResult,
  CreateProfileImageFileResult,
  ProfileImageRepository,
  StoredFileRecord,
} from '../../app/ports/profile-image.repository';

type PrismaStoredFile = Readonly<{
  id: string;
  status: PrismaFileStatus;
  bucket: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: Date | null;
}>;

function toStoredFileRecord(file: PrismaStoredFile): StoredFileRecord {
  return {
    id: file.id,
    status: file.status,
    bucket: file.bucket,
    objectKey: file.objectKey,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    uploadedAt: file.uploadedAt,
  };
}

@Injectable()
export class PrismaProfileImageRepository implements ProfileImageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createProfileImageFile(input: {
    fileId: string;
    ownerUserId: string;
    bucket: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
    traceId: string;
    now: Date;
  }): Promise<CreateProfileImageFileResult> {
    const client = this.prisma.getClient();

    const user = await client.user.findUnique({
      where: { id: input.ownerUserId },
      select: { status: true },
    });
    if (!user || user.status === PrismaUserStatus.DELETED) return { kind: 'not_found' };

    await client.storedFile.create({
      data: {
        id: input.fileId,
        ownerUserId: input.ownerUserId,
        purpose: PrismaFilePurpose.PROFILE_IMAGE,
        status: PrismaFileStatus.UPLOADING,
        bucket: input.bucket,
        objectKey: input.objectKey,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        traceId: input.traceId,
      },
      select: { id: true },
    });

    return { kind: 'ok' };
  }

  async findStoredFileForOwner(
    fileId: string,
    ownerUserId: string,
  ): Promise<StoredFileRecord | null> {
    const client = this.prisma.getClient();

    const file = await client.storedFile.findFirst({
      where: { id: fileId, ownerUserId },
      select: {
        id: true,
        status: true,
        bucket: true,
        objectKey: true,
        contentType: true,
        sizeBytes: true,
        uploadedAt: true,
      },
    });
    if (!file) return null;
    return toStoredFileRecord(file);
  }

  async getProfileImageFileId(userId: string): Promise<string | null> {
    const client = this.prisma.getClient();

    const profile = await client.userProfile.findUnique({
      where: { userId },
      select: { profileImageFileId: true },
    });
    return profile?.profileImageFileId ?? null;
  }

  async attachProfileImageFile(input: {
    userId: string;
    fileId: string;
    now: Date;
  }): Promise<AttachProfileImageResult> {
    return await this.prisma.transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { status: true },
      });
      if (!user || user.status === PrismaUserStatus.DELETED) return { kind: 'not_found' };

      const profile = await tx.userProfile.findUnique({
        where: { userId: input.userId },
        select: { profileImageFileId: true },
      });
      const previousFileId = profile?.profileImageFileId ?? null;

      await tx.storedFile.updateMany({
        where: {
          id: input.fileId,
          ownerUserId: input.userId,
          status: { not: PrismaFileStatus.DELETED },
          OR: [{ status: PrismaFileStatus.UPLOADING }, { uploadedAt: null }],
        },
        data: { status: PrismaFileStatus.ACTIVE, uploadedAt: input.now },
      });

      await tx.user.update({
        where: { id: input.userId },
        data: {
          profile: {
            upsert: {
              create: { profileImageFileId: input.fileId },
              update: { profileImageFileId: input.fileId },
            },
          },
        },
        select: { id: true },
      });

      return { kind: 'ok', previousFileId };
    });
  }

  async markStoredFileDeleted(input: {
    fileId: string;
    ownerUserId: string;
    now: Date;
  }): Promise<void> {
    const client = this.prisma.getClient();

    await client.storedFile.updateMany({
      where: {
        id: input.fileId,
        ownerUserId: input.ownerUserId,
        status: { not: PrismaFileStatus.DELETED },
      },
      data: { status: PrismaFileStatus.DELETED, deletedAt: input.now },
    });
  }
}
