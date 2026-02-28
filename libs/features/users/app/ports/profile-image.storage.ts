export type ProfileImagePresignedPutObject = Readonly<{
  method: 'PUT';
  url: string;
  headers: Readonly<Record<string, string>>;
}>;

export type ProfileImagePresignedGetObject = Readonly<{
  url: string;
}>;

export type ProfileImageHeadObjectResult = Readonly<{
  exists: boolean;
  contentType?: string;
  contentLength?: number;
  etag?: string;
}>;

export interface ProfileImageStoragePort {
  isEnabled(): boolean;
  getBucketName(): string;
  presignPutObject(input: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<ProfileImagePresignedPutObject>;
  presignGetObject(input: {
    key: string;
    expiresInSeconds: number;
  }): Promise<ProfileImagePresignedGetObject>;
  headObject(key: string): Promise<ProfileImageHeadObjectResult>;
  deleteObject(key: string): Promise<void>;
}
