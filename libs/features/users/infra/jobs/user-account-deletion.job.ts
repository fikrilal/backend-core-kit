import { jobName } from '../../../../platform/queue/job-name';
import type { JsonObject } from '../../../../platform/queue/json.types';
import { queueName } from '../../../../platform/queue/queue-name';

export const USERS_QUEUE = queueName('users');

export const USERS_FINALIZE_ACCOUNT_DELETION_JOB = jobName('users.finalizeAccountDeletion');

export type UsersFinalizeAccountDeletionJobData = Readonly<{
  userId: string;
  scheduledFor: string;
  enqueuedAt: string;
}> &
  JsonObject;

export function finalizeAccountDeletionJobId(userId: string): string {
  // BullMQ job ids cannot contain ":".
  return `users.finalizeAccountDeletion-${userId}`;
}
