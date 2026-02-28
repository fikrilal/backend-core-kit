import { Injectable } from '@nestjs/common';
import { ObjectStorageService } from '../../../../platform/storage/object-storage.service';
import type {
  ProfileImageHeadObjectResult,
  ProfileImagePresignedGetObject,
  ProfileImagePresignedPutObject,
  ProfileImageStoragePort,
} from '../../app/ports/profile-image.storage';

@Injectable()
export class UsersProfileImageStorageAdapter implements ProfileImageStoragePort {
  constructor(private readonly storage: ObjectStorageService) {}

  isEnabled(): boolean {
    return this.storage.isEnabled();
  }

  getBucketName(): string {
    return this.storage.getBucketName();
  }

  async presignPutObject(input: {
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<ProfileImagePresignedPutObject> {
    const put = await this.storage.presignPutObject(input);
    return {
      method: put.method,
      url: put.url,
      headers: put.headers,
    };
  }

  async presignGetObject(input: {
    key: string;
    expiresInSeconds: number;
  }): Promise<ProfileImagePresignedGetObject> {
    const get = await this.storage.presignGetObject(input);
    return { url: get.url };
  }

  async headObject(key: string): Promise<ProfileImageHeadObjectResult> {
    const head = await this.storage.headObject(key);
    return {
      exists: head.exists,
      contentType: head.contentType,
      contentLength: head.contentLength,
      etag: head.etag,
    };
  }

  deleteObject(key: string): Promise<void> {
    return this.storage.deleteObject(key);
  }
}
