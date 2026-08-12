import { jobName } from '../queue/job-name';
import { queueName } from '../queue/queue-name';
import type { JsonObject } from '../queue/json.types';

export const PUSH_QUEUE = queueName('push');

export const PUSH_SEND_JOB = jobName('push.send');

export type PushSendJobData = Readonly<{
  sessionId: string;
  notification?: Readonly<{ title?: string; body?: string }>;
  data?: Readonly<Record<string, string>>;
  requestedAt: string;
}> &
  JsonObject;
