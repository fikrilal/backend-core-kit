export type StoredFileStatus = 'UPLOADING' | 'ACTIVE' | 'DELETED';

export type StoredFileRecord = Readonly<{
  id: string;
  status: StoredFileStatus;
  bucket: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: Date | null;
}>;

export type CreateProfileImageFileResult =
  | Readonly<{ kind: 'ok' }>
  | Readonly<{ kind: 'not_found' }>;

export type AttachProfileImageResult =
  | Readonly<{ kind: 'ok'; previousFileId: string | null }>
  | Readonly<{ kind: 'not_found' }>;

export type ClearProfileImageResult =
  | Readonly<{ kind: 'ok'; clearedFile: Readonly<{ id: string; objectKey: string }> | null }>
  | Readonly<{ kind: 'not_found' }>;

export interface ProfileImageRepository {
  createProfileImageFile(input: {
    fileId: string;
    ownerUserId: string;
    bucket: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
    traceId: string;
    now: Date;
  }): Promise<CreateProfileImageFileResult>;

  findStoredFileForOwner(fileId: string, ownerUserId: string): Promise<StoredFileRecord | null>;

  getProfileImageFileId(userId: string): Promise<string | null>;

  attachProfileImageFile(input: {
    userId: string;
    fileId: string;
    now: Date;
  }): Promise<AttachProfileImageResult>;

  clearProfileImage(input: { userId: string; now: Date }): Promise<ClearProfileImageResult>;

  markStoredFileDeleted(input: { fileId: string; ownerUserId: string; now: Date }): Promise<void>;
}
