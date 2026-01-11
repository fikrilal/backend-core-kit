import { Injectable } from '@nestjs/common';
import { EmailService } from '../../../../platform/email/email.service';
import { QueueProducer } from '../../../../platform/queue/queue.producer';
import {
  AUTH_SEND_VERIFICATION_EMAIL_JOB,
  EMAIL_QUEUE,
  type AuthSendVerificationEmailJobData,
} from './auth-email-verification.job';

@Injectable()
export class AuthEmailVerificationJobs {
  constructor(
    private readonly queue: QueueProducer,
    private readonly email: EmailService,
  ) {}

  isEnabled(): boolean {
    return this.queue.isEnabled() && this.email.isEnabled();
  }

  async enqueueSendVerificationEmail(userId: string): Promise<boolean> {
    if (!this.queue.isEnabled()) return false;
    if (!this.email.isEnabled()) return false;

    const data: AuthSendVerificationEmailJobData = {
      userId,
      requestedAt: new Date().toISOString(),
    };

    await this.queue.enqueue(EMAIL_QUEUE, AUTH_SEND_VERIFICATION_EMAIL_JOB, data);
    return true;
  }
}
