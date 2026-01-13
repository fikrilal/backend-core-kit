import { Inject, Injectable } from '@nestjs/common';
import { QueueProducer } from '../queue/queue.producer';
import { PUSH_QUEUE, PUSH_SEND_JOB, type PushSendJobData } from './push.job';
import { PUSH_SERVICE } from './push.tokens';
import type { PushService } from './push.service';
import type { PushMessageData, PushNotification } from './push.types';

@Injectable()
export class PushJobs {
  constructor(
    private readonly queue: QueueProducer,
    @Inject(PUSH_SERVICE) private readonly push: PushService,
  ) {}

  isEnabled(): boolean {
    return this.queue.isEnabled() && this.push.isEnabled();
  }

  async enqueueSendToSession(input: {
    sessionId: string;
    notification?: PushNotification;
    data?: PushMessageData;
  }): Promise<boolean> {
    if (!this.queue.isEnabled()) return false;
    if (!this.push.isEnabled()) return false;

    const data: PushSendJobData = {
      sessionId: input.sessionId,
      ...(input.notification ? { notification: input.notification } : {}),
      ...(input.data ? { data: input.data } : {}),
      requestedAt: new Date().toISOString(),
    };

    await this.queue.enqueue(PUSH_QUEUE, PUSH_SEND_JOB, data);
    return true;
  }
}
