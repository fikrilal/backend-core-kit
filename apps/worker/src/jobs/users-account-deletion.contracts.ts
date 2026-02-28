import type { JsonObject } from '../../../../libs/platform/queue/json.types';
import type { UsersFinalizeAccountDeletionJobData } from '../../../../libs/features/users/infra/jobs/user-account-deletion.job';
import type {
  UsersProfileImageDeleteStoredFileJobData,
  UsersProfileImageExpireUploadJobData,
} from '../../../../libs/features/users/infra/jobs/profile-image-cleanup.job';

export type UsersFinalizeAccountDeletionJobResult = Readonly<{
  ok: true;
  userId: string;
  outcome: 'finalized' | 'skipped';
  reason?:
    | 'user_not_found'
    | 'already_deleted'
    | 'not_scheduled'
    | 'not_due'
    | 'blocked_last_admin';
  deletedAt?: string;
  rescheduledUntil?: string;
}> &
  JsonObject;

export type UsersProfileImageDeleteStoredFileJobResult = Readonly<{
  ok: true;
  fileId: string;
  outcome: 'deleted' | 'skipped';
  reason?: 'file_not_found' | 'storage_not_configured' | 'not_profile_image';
}> &
  JsonObject;

export type UsersProfileImageExpireUploadJobResult = Readonly<{
  ok: true;
  fileId: string;
  outcome: 'expired' | 'skipped';
  reason?: 'file_not_found' | 'not_profile_image' | 'not_uploading' | 'storage_not_configured';
}> &
  JsonObject;

export type UsersQueueJobData =
  | UsersFinalizeAccountDeletionJobData
  | UsersProfileImageDeleteStoredFileJobData
  | UsersProfileImageExpireUploadJobData;

export type UsersQueueJobResult =
  | UsersFinalizeAccountDeletionJobResult
  | UsersProfileImageDeleteStoredFileJobResult
  | UsersProfileImageExpireUploadJobResult;

export type UsersFinalizeDeletionTxnResult =
  | Readonly<{ kind: 'skipped'; reason: 'user_not_found' }>
  | Readonly<{ kind: 'skipped'; reason: 'not_scheduled'; userId: string }>
  | Readonly<{ kind: 'skipped'; reason: 'already_deleted'; userId: string }>
  | Readonly<{ kind: 'not_due'; userId: string; scheduledFor: Date }>
  | Readonly<{ kind: 'blocked_last_admin'; userId: string }>
  | Readonly<{ kind: 'finalized'; userId: string }>;
