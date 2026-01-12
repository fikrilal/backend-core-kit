import { jobName } from '../../../../platform/queue/job-name';
import type { JsonObject } from '../../../../platform/queue/json.types';
export { EMAIL_QUEUE } from '../../../../platform/email/email.queue';

export const AUTH_SEND_VERIFICATION_EMAIL_JOB = jobName('auth.sendVerificationEmail');

export type AuthSendVerificationEmailJobData = Readonly<{
  userId: string;
  requestedAt: string;
}> &
  JsonObject;
