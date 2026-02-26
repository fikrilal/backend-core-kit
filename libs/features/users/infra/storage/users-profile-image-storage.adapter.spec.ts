import type { ObjectStorageService } from '../../../../platform/storage/object-storage.service';
import { UsersProfileImageStorageAdapter } from './users-profile-image-storage.adapter';

function asObjectStorageService(storage: Partial<ObjectStorageService>): ObjectStorageService {
  return storage as ObjectStorageService;
}

describe('UsersProfileImageStorageAdapter', () => {
  it('delegates isEnabled and getBucketName', () => {
    const storage = asObjectStorageService({
      isEnabled: () => true,
      getBucketName: () => 'bucket-1',
    });
    const adapter = new UsersProfileImageStorageAdapter(storage);

    expect(adapter.isEnabled()).toBe(true);
    expect(adapter.getBucketName()).toBe('bucket-1');
  });

  it('delegates presign and object operations', async () => {
    const storage = asObjectStorageService({
      presignPutObject: async () => ({
        method: 'PUT',
        url: 'https://example.com/upload',
        headers: { 'Content-Type': 'image/png' },
      }),
      presignGetObject: async () => ({ url: 'https://example.com/get' }),
      headObject: async () => ({
        exists: true,
        contentType: 'image/png',
        contentLength: 123,
        etag: 'etag-1',
      }),
      deleteObject: async () => undefined,
    });

    const adapter = new UsersProfileImageStorageAdapter(storage);

    await expect(
      adapter.presignPutObject({
        key: 'users/user-1/profile-images/file-1',
        contentType: 'image/png',
        expiresInSeconds: 300,
      }),
    ).resolves.toEqual({
      method: 'PUT',
      url: 'https://example.com/upload',
      headers: { 'Content-Type': 'image/png' },
    });

    await expect(
      adapter.presignGetObject({
        key: 'users/user-1/profile-images/file-1',
        expiresInSeconds: 60,
      }),
    ).resolves.toEqual({
      url: 'https://example.com/get',
    });

    await expect(adapter.headObject('users/user-1/profile-images/file-1')).resolves.toEqual({
      exists: true,
      contentType: 'image/png',
      contentLength: 123,
      etag: 'etag-1',
    });

    await expect(
      adapter.deleteObject('users/user-1/profile-images/file-1'),
    ).resolves.toBeUndefined();
  });
});
