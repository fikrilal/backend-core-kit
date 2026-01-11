import { jobName } from '../../../../platform/queue/job-name';
import type { JsonObject } from '../../../../platform/queue/json.types';
import { queueName } from '../../../../platform/queue/queue-name';

export const EMAIL_QUEUE = queueName('emails');

export const AUTH_SEND_VERIFICATION_EMAIL_JOB = jobName('auth.sendVerificationEmail');

export type AuthSendVerificationEmailJobData = Readonly<{
  userId: string;
  requestedAt: string;
}> &
  JsonObject;
