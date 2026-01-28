import { ObjectStorageService } from './object-storage.service';
import { ObjectStorageError } from './object-storage.types';
import type { ConfigService } from '@nestjs/config';

type Send = (command: unknown) => Promise<unknown>;
type GetSignedUrl = (
  client: unknown,
  command: unknown,
  options?: { expiresIn?: number; signableHeaders?: Set<string> },
) => Promise<string>;

const sendMock = jest.fn<ReturnType<Send>, Parameters<Send>>();
const getSignedUrlMock = jest.fn<ReturnType<GetSignedUrl>, Parameters<GetSignedUrl>>();
const s3ClientConfigs: unknown[] = [];

jest.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    constructor(config: unknown) {
      s3ClientConfigs.push(config);
    }
    send = sendMock;
  }

  class PutObjectCommand {
    constructor(readonly input: unknown) {}
  }
  class GetObjectCommand {
    constructor(readonly input: unknown) {}
  }
  class HeadObjectCommand {
    constructor(readonly input: unknown) {}
  }
  class DeleteObjectCommand {
    constructor(readonly input: unknown) {}
  }

  return {
    __esModule: true,
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => {
  return {
    __esModule: true,
    getSignedUrl: (...args: Parameters<GetSignedUrl>) => getSignedUrlMock(...args),
  };
});

function stubConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: <T = unknown>(key: string): T | undefined => values[key] as T | undefined,
  } as unknown as ConfigService;
}

function configuredStorageConfig(): Record<string, unknown> {
  return {
    STORAGE_S3_ENDPOINT: 'http://localhost:9000',
    STORAGE_S3_REGION: 'us-east-1',
    STORAGE_S3_BUCKET: 'bucket',
    STORAGE_S3_ACCESS_KEY_ID: 'key',
    STORAGE_S3_SECRET_ACCESS_KEY: 'secret',
    STORAGE_S3_FORCE_PATH_STYLE: true,
  };
}

describe('ObjectStorageService', () => {
  beforeEach(() => {
    sendMock.mockReset();
    getSignedUrlMock.mockReset();
    s3ClientConfigs.length = 0;
  });

  it('reports disabled when not configured', () => {
    const service = new ObjectStorageService(stubConfig({}));
    expect(service.isEnabled()).toBe(false);
  });

  it('throws ObjectStorageError when accessed without configuration', () => {
    const service = new ObjectStorageService(stubConfig({}));
    expect(() => service.getBucketName()).toThrow(ObjectStorageError);
  });

  it('reports enabled when fully configured', () => {
    const service = new ObjectStorageService(stubConfig(configuredStorageConfig()));
    expect(service.isEnabled()).toBe(true);
    expect(service.getBucketName()).toBe('bucket');
  });

  it('configures S3 client to avoid default checksums (required for presigned uploads)', () => {
    // If the SDK injects default CRC32 checksums into presigned PUT URLs, clients will get 400s
    // unless they also send a matching checksum. We avoid that by requiring explicit checksums only.
    new ObjectStorageService(stubConfig(configuredStorageConfig()));

    const config = s3ClientConfigs[0];
    expect(typeof config).toBe('object');
    expect(config).not.toBeNull();
    expect((config as { requestChecksumCalculation?: unknown }).requestChecksumCalculation).toBe(
      'WHEN_REQUIRED',
    );
  });

  it('presigns PUT with content-type signable header', async () => {
    const service = new ObjectStorageService(stubConfig(configuredStorageConfig()));
    getSignedUrlMock.mockResolvedValueOnce('https://signed');

    const res = await service.presignPutObject({
      key: 'users/u1/profile-images/f1',
      contentType: 'image/png',
      expiresInSeconds: 60,
    });

    expect(res).toEqual({
      method: 'PUT',
      url: 'https://signed',
      headers: { 'Content-Type': 'image/png' },
    });

    const args = getSignedUrlMock.mock.calls[0];
    expect(args).toBeDefined();
    expect(args?.[2]?.expiresIn).toBe(60);
    expect(args?.[2]?.signableHeaders).toEqual(new Set(['content-type']));
  });

  it('headObject returns exists=false for NotFound errors', async () => {
    const service = new ObjectStorageService(stubConfig(configuredStorageConfig()));
    sendMock.mockRejectedValueOnce({ name: 'NotFound' });

    await expect(service.headObject('users/u1/profile-images/f1')).resolves.toEqual({
      exists: false,
    });
  });

  it('headObject returns exists=false for 404 errors', async () => {
    const service = new ObjectStorageService(stubConfig(configuredStorageConfig()));
    sendMock.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });

    await expect(service.headObject('users/u1/profile-images/f1')).resolves.toEqual({
      exists: false,
    });
  });

  it('headObject returns selected metadata on success', async () => {
    const service = new ObjectStorageService(stubConfig(configuredStorageConfig()));
    sendMock.mockResolvedValueOnce({
      ContentType: 'image/png',
      ContentLength: 123,
      ETag: '"etag"',
    });

    await expect(service.headObject('users/u1/profile-images/f1')).resolves.toEqual({
      exists: true,
      contentType: 'image/png',
      contentLength: 123,
      etag: '"etag"',
    });
  });

  it('deleteObject is idempotent for NoSuchKey/404', async () => {
    const service = new ObjectStorageService(stubConfig(configuredStorageConfig()));
    sendMock.mockRejectedValueOnce({ name: 'NoSuchKey' });
    await expect(service.deleteObject('users/u1/profile-images/f1')).resolves.toBeUndefined();

    sendMock.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    await expect(service.deleteObject('users/u1/profile-images/f1')).resolves.toBeUndefined();
  });
});
