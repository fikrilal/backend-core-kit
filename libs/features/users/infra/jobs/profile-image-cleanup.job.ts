import { jobName, type JsonObject } from '../../../../platform/queue/queue.types';
import { USERS_QUEUE } from '../../account-deletion/users.queue';

export { USERS_QUEUE };

export const USERS_PROFILE_IMAGE_DELETE_STORED_FILE_JOB = jobName(
  'users.profileImage.deleteStoredFile',
);

export const USERS_PROFILE_IMAGE_EXPIRE_UPLOAD_JOB = jobName('users.profileImage.expireUpload');

export type UsersProfileImageDeleteStoredFileJobData = Readonly<{
  fileId: string;
  ownerUserId: string;
  enqueuedAt: string;
}> &
  JsonObject;

export type UsersProfileImageExpireUploadJobData = Readonly<{
  fileId: string;
  ownerUserId: string;
  enqueuedAt: string;
  expiresAt: string;
}> &
  JsonObject;

export function deleteStoredFileJobId(fileId: string): string {
  // BullMQ job ids cannot contain ":".
  return `users.profileImage.deleteStoredFile-${fileId}`;
}

export function expireUploadJobId(fileId: string): string {
  // BullMQ job ids cannot contain ":".
  return `users.profileImage.expireUpload-${fileId}`;
}
