import { jobName, type JsonObject } from '../../../platform/queue/queue.types';

export const AUTH_SEND_PASSWORD_RESET_EMAIL_JOB = jobName('auth.sendPasswordResetEmail');

export type AuthSendPasswordResetEmailJobData = Readonly<{
  userId: string;
  requestedAt: string;
}> &
  JsonObject;
