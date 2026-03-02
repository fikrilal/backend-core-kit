import type { JsonObject } from '../../../../libs/platform/queue/json.types';
import type { AuthSendVerificationEmailJobData } from '../../../../libs/features/auth/infra/jobs/auth-email-verification.job';
import type { AuthSendPasswordResetEmailJobData } from '../../../../libs/features/auth/infra/jobs/auth-password-reset.job';
import type {
  UsersSendAccountDeletionReminderEmailJobData,
  UsersSendAccountDeletionRequestedEmailJobData,
} from '../../../../libs/features/users/infra/jobs/user-account-deletion-email.job';

export type AuthSendVerificationEmailJobResult = Readonly<{
  ok: true;
  userId: string;
  outcome: 'sent' | 'skipped';
  reason?: 'user_not_found' | 'already_verified' | 'already_deleted';
  emailId?: string;
  tokenExpiresAt?: string;
}> &
  JsonObject;

export type UsersSendAccountDeletionRequestedEmailJobResult = Readonly<{
  ok: true;
  userId: string;
  outcome: 'sent' | 'skipped';
  reason?: 'user_not_found' | 'not_scheduled' | 'already_deleted';
  emailId?: string;
  scheduledFor?: string;
}> &
  JsonObject;

export type UsersSendAccountDeletionReminderEmailJobResult = Readonly<{
  ok: true;
  userId: string;
  outcome: 'sent' | 'skipped';
  reason?: 'user_not_found' | 'not_scheduled' | 'already_deleted' | 'too_late';
  emailId?: string;
  scheduledFor?: string;
}> &
  JsonObject;

export type AuthSendPasswordResetEmailJobResult = Readonly<{
  ok: true;
  userId: string;
  outcome: 'sent' | 'skipped';
  reason?: 'user_not_found' | 'already_deleted';
  emailId?: string;
  tokenExpiresAt?: string;
  resetLink?: string;
}> &
  JsonObject;

export type EmailsJobData =
  | AuthSendVerificationEmailJobData
  | AuthSendPasswordResetEmailJobData
  | UsersSendAccountDeletionRequestedEmailJobData
  | UsersSendAccountDeletionReminderEmailJobData;

export type EmailsJobResult =
  | AuthSendVerificationEmailJobResult
  | AuthSendPasswordResetEmailJobResult
  | UsersSendAccountDeletionRequestedEmailJobResult
  | UsersSendAccountDeletionReminderEmailJobResult;
