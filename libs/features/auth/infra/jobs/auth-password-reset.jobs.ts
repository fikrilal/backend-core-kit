import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../../../../platform/email/email.service';
import { QueueProducer } from '../../../../platform/queue/queue.producer';
import { EMAIL_QUEUE } from './auth-email-verification.job';
import {
  AUTH_SEND_PASSWORD_RESET_EMAIL_JOB,
  type AuthSendPasswordResetEmailJobData,
} from './auth-password-reset.job';

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

@Injectable()
export class AuthPasswordResetJobs {
  private readonly publicAppUrl?: string;

  constructor(
    private readonly queue: QueueProducer,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {
    this.publicAppUrl = asNonEmptyString(this.config.get<string>('PUBLIC_APP_URL'));
  }

  isEnabled(): boolean {
    return this.queue.isEnabled() && this.email.isEnabled() && this.publicAppUrl !== undefined;
  }

  async enqueueSendPasswordResetEmail(userId: string): Promise<boolean> {
    if (!this.queue.isEnabled()) return false;
    if (!this.email.isEnabled()) return false;
    if (!this.publicAppUrl) return false;

    const data: AuthSendPasswordResetEmailJobData = {
      userId,
      requestedAt: new Date().toISOString(),
    };

    await this.queue.enqueue(EMAIL_QUEUE, AUTH_SEND_PASSWORD_RESET_EMAIL_JOB, data);
    return true;
  }
}
