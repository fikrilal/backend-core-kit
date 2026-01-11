import { jobName } from '../../../../platform/queue/job-name';
import type { JsonObject } from '../../../../platform/queue/json.types';

export const AUTH_SEND_PASSWORD_RESET_EMAIL_JOB = jobName('auth.sendPasswordResetEmail');

export type AuthSendPasswordResetEmailJobData = Readonly<{
  userId: string;
  requestedAt: string;
}> &
  JsonObject;
