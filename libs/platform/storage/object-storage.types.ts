export type PresignedPutObject = Readonly<{
  method: 'PUT';
  url: string;
  headers: Readonly<Record<string, string>>;
}>;

export type PresignedGetObject = Readonly<{
  url: string;
}>;

export type HeadObjectResult = Readonly<{
  exists: boolean;
  contentType?: string;
  contentLength?: number;
  etag?: string;
}>;

export class ObjectStorageError extends Error {
  readonly provider: 's3';

  constructor(message: string) {
    super(message);
    this.name = 'ObjectStorageError';
    this.provider = 's3';
  }
}
