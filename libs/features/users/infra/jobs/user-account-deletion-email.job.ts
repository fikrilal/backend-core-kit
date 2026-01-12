import { jobName } from '../../../../platform/queue/job-name';
import type { JsonObject } from '../../../../platform/queue/json.types';
import { EMAIL_QUEUE } from '../../../../platform/email/email.queue';

export { EMAIL_QUEUE };

export const USERS_SEND_ACCOUNT_DELETION_REQUESTED_EMAIL_JOB = jobName(
  'users.sendAccountDeletionRequestedEmail',
);

export const USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB = jobName(
  'users.sendAccountDeletionReminderEmail',
);

export type UsersSendAccountDeletionRequestedEmailJobData = Readonly<{
  userId: string;
  requestedAt: string;
  scheduledFor: string;
}> &
  JsonObject;

export type UsersSendAccountDeletionReminderEmailJobData = Readonly<{
  userId: string;
  enqueuedAt: string;
  reminderAt: string;
  scheduledFor: string;
}> &
  JsonObject;

export function accountDeletionRequestedEmailJobId(userId: string): string {
  return `users.accountDeletionRequestedEmail-${userId}`;
}

export function accountDeletionReminderEmailJobId(userId: string): string {
  return `users.accountDeletionReminderEmail-${userId}`;
}
