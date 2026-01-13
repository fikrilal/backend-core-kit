import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  HeadObjectResult,
  PresignedGetObject,
  PresignedPutObject,
} from './object-storage.types';
import { ObjectStorageError } from './object-storage.types';

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNotFoundError(err: unknown): boolean {
  if (!isRecord(err)) return false;

  const name = typeof err.name === 'string' ? err.name : undefined;
  if (name === 'NotFound' || name === 'NoSuchKey') return true;

  const metadata = err.$metadata;
  if (isRecord(metadata) && typeof metadata.httpStatusCode === 'number') {
    return metadata.httpStatusCode === 404;
  }

  return false;
}

@Injectable()
export class ObjectStorageService {
  private readonly enabled: boolean;
  private readonly client?: S3Client;
  private readonly bucket?: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = asNonEmptyString(this.config.get<string>('STORAGE_S3_ENDPOINT'));
    const region = asNonEmptyString(this.config.get<string>('STORAGE_S3_REGION'));
    const bucket = asNonEmptyString(this.config.get<string>('STORAGE_S3_BUCKET'));
    const accessKeyId = asNonEmptyString(this.config.get<string>('STORAGE_S3_ACCESS_KEY_ID'));
    const secretAccessKey = asNonEmptyString(
      this.config.get<string>('STORAGE_S3_SECRET_ACCESS_KEY'),
    );
    const forcePathStyle = this.config.get<boolean>('STORAGE_S3_FORCE_PATH_STYLE');

    const configured =
      endpoint !== undefined &&
      region !== undefined &&
      bucket !== undefined &&
      accessKeyId !== undefined &&
      secretAccessKey !== undefined;

    this.enabled = configured;
    this.bucket = bucket;

    if (configured) {
      this.client = new S3Client({
        region,
        endpoint,
        forcePathStyle: forcePathStyle ?? false,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getBucketName(): string {
    return this.assertConfigured().bucket;
  }

  private assertConfigured(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      throw new ObjectStorageError(
        'Object storage is not configured (set STORAGE_S3_ENDPOINT, STORAGE_S3_REGION, STORAGE_S3_BUCKET, STORAGE_S3_ACCESS_KEY_ID, STORAGE_S3_SECRET_ACCESS_KEY)',
      );
    }

    return { client: this.client, bucket: this.bucket };
  }

  async presignPutObject(input: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<PresignedPutObject> {
    const { client, bucket } = this.assertConfigured();

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      ContentType: input.contentType,
    });

    const url = await getSignedUrl(client, command, {
      expiresIn: input.expiresInSeconds,
      signableHeaders: new Set(['content-type']),
    });

    return {
      method: 'PUT',
      url,
      headers: { 'Content-Type': input.contentType },
    };
  }

  async presignGetObject(input: {
    key: string;
    expiresInSeconds: number;
  }): Promise<PresignedGetObject> {
    const { client, bucket } = this.assertConfigured();

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: input.key,
    });

    const url = await getSignedUrl(client, command, { expiresIn: input.expiresInSeconds });
    return { url };
  }

  async headObject(key: string): Promise<HeadObjectResult> {
    const { client, bucket } = this.assertConfigured();

    try {
      const res = await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );

      return {
        exists: true,
        contentType: typeof res.ContentType === 'string' ? res.ContentType : undefined,
        contentLength: typeof res.ContentLength === 'number' ? res.ContentLength : undefined,
        etag: typeof res.ETag === 'string' ? res.ETag : undefined,
      };
    } catch (err: unknown) {
      if (isNotFoundError(err)) return { exists: false };
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const { client, bucket } = this.assertConfigured();

    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
    } catch (err: unknown) {
      if (isNotFoundError(err)) return;
      throw err;
    }
  }
}
