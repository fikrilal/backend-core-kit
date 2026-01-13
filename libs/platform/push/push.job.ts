import { jobName } from '../queue/job-name';
import type { JsonObject } from '../queue/json.types';
import { PUSH_QUEUE } from './push.queue';

export { PUSH_QUEUE };

export const PUSH_SEND_JOB = jobName('push.send');

export type PushSendJobData = Readonly<{
  sessionId: string;
  notification?: Readonly<{ title?: string; body?: string }>;
  data?: Readonly<Record<string, string>>;
  requestedAt: string;
}> &
  JsonObject;
